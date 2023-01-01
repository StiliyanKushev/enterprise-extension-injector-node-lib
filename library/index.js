// ---- IMPORTS ---- //
const os = require('os')
const cp = require('child_process')
const ut = require('util')
const ph = require('path')
const fs = require('fs')
const cr = require('crypto')
const http = require('http')

// ---- GLOBAL VARIABLES ---- //
const EXTENSION_SERVER_PORT = process.env.ENTERPRISE_EXTENSION_SERVER_PORT || 777
const operatingSystem = os.type() == 'Darwin' ? 'mac' : os.type() == 'Windows_NT' ? 'windows' : 'linux'
const execPromise = ut.promisify(cp.exec)
const existPromise = ut.promisify(fs.exists)
const writePromise = ut.promisify(fs.writeFile)
const readPromise = ut.promisify(fs.readFile)
const renamePromise = ut.promisify(fs.rename)
const compiledExtensionsPath = ph.join(__dirname, './compiled')
const privateKeysPath = ph.join(__dirname, './pems')

// ---- HELPER FUNCTIONS ---- //

function GetExtensionPathFromID(extensionId) {
    return ph.join(compiledExtensionsPath, `${extensionId}.crx`)
}

async function CreatePrivateKeyFile() {

    // `2>/dev/null openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out ${out}`

    let out = ph.join(privateKeysPath, `${Date.now()}_key.pem`)

    // generate a 2048-bit RSA key pair
    const { privateKey } = cr.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'pkcs1',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs1',
            format: 'pem'
        }
    })
    
    // convert the private key to PKCS8 format
    let pkcs8PrivateKey = cr.createPrivateKey({
        key: privateKey,
        format: 'pem',
        type: 'pkcs8'
    })
    
    // convert the private key to a string
    pkcs8PrivateKey = pkcs8PrivateKey.export({
        type: 'pkcs8',
        format: 'pem'
    })

    // write the PKCS8 private key to a file
    await writePromise(out, pkcs8PrivateKey)

    if(operatingSystem == 'linux') {
        await execPromise(`chmod 777 ${out}`)
    }
    else if(operatingSystem == 'windows') {
        // note: probably nothing to do here
    }
    else if(operatingSystem == 'mac') {
        // todo: we might want to do something here
    }

    return out
}

async function CalculateExtensionId(keyPath) {

    // `2>/dev/null openssl rsa -in ${keyPath} -pubout -outform DER |  shasum -a 256 | head -c32 | tr 0-9a-f a-p`

    let extId

    // read the RSA private key
    const privateKey = await readPromise(keyPath, 'utf8')

    // generate the corresponding public key
    const publicKey = cr.createPublicKey({
        key: privateKey,
        format: 'pem',
    })

    // convert the public key to DER format
    const derPublicKey = publicKey.export({
        type: 'spki',
        format: 'der'
    })

    // create a SHA-256 hash object
    const hash = cr.createHash('sha256')

    // update the hash with the DER-formatted public key
    hash.update(derPublicKey)

    // hexadecimal representation of the hash, truncated to 32 characters
    extId = hash.digest('hex').slice(0, 32)

    // truncate the result the same way chrome does it (using tr 0-9a-f a-p)
    const mapping = {
        '0': 'a', '1': 'b', '2': 'c', '3': 'd', '4': 'e', '5': 'f',
        '6': 'g', '7': 'h', '8': 'i', '9': 'j', 'a': 'k', 'b': 'l',
        'c': 'm', 'd': 'n', 'e': 'o', 'f': 'p'
    }
    extId = extId.replace(/[0-9a-f]/g, c => mapping[c])

    return extId
}

async function PackExtension(browserPath, extensionPath, keyPath, extensionId) {
    let crxPath, crxPathFinal = GetExtensionPathFromID(extensionId)

    await execPromise(`${browserPath} --no-sandbox --pack-extension=${extensionPath} --pack-extension-key=${keyPath}`)
    crxPath = ph.join(extensionPath, `../${extensionPath.split(ph.sep).pop()}.crx`)

    if(operatingSystem == 'linux') {
        await execPromise(`chmod 777 ${crxPath}`)
    }
    else if(operatingSystem == 'windows') {
        // note: probably nothing to do here
    }
    else if(operatingSystem == 'mac') {
        // todo: we might want to do something here
    }

    // here we want to move the crx to our known predefined location
    // and store it based on the extenion id instead of the extension name
    await renamePromise(crxPath, crxPathFinal)

    return crxPathFinal
}

let hostingServer = null
let hostUrl = HostExtension('127.0.0.1', EXTENSION_SERVER_PORT)
console.log(`Extension hosted at: "${hostUrl}"`)

function HostExtension(address, port) {
    hostingServer = http.createServer(async (req, res) => {
        const extensionData = new URL(`http://localhost${req.url}`).pathname.slice(1)
        const [ extensionId, requestType ] = extensionData.split('.')
        console.log(`Extension server received a request. [${extensionId}] [${requestType}]`)

        // handle a request that the browser sends to us to fetch the extension meta data
        if(requestType == 'xml') {
            console.log(`Retunring dynamically generated xml for that extension.`)
            const content = `
                <gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
                    <app appid='${extensionId}'>
                        <updatecheck codebase='${hostUrl}${extensionId}.crx' version='2.0' />
                    </app>
                </gupdate>
            `
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/xml')
            res.write(content)
            res.end()
        }
        // handle a request that the browser sends to fetch the extension itself
        else {                
            const extensionPath = GetExtensionPathFromID(extensionId)
            console.log(`Extension path should be at: ${extensionPath}`)

            // handle not found (should not happen but still)
            if(!extensionPath || !await existPromise(extensionPath)) {
                console.log(`Extension not found (404)`)
                res.statusCode = 404
                res.end('invalid extension id')
                return
            }

            console.log(`Returning file at: "${extensionPath}"`)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/x-chrome-extension')
            const content = await readPromise(extensionPath)
            res.write(content, 'binary')
            res.end()
        }
    })
    hostingServer.listen({ host: address, port: port })
    return `http://${address}:${port}/`
}

async function ForceInstallExtension(extensionId, hostUrl, targetBrowsers) {
    let entries = []

    // a map of all entries we want to hit based on browser and OS
    // can be anything, path, registery..
    // https://chromium.googlesource.com/chromium/src/+/HEAD/docs/enterprise/policies.md
    // https://community.brave.com/t/policy-files-seem-to-have-no-effect-brave-on-linux/191068/6
    // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/alternate-distribution-options
    const entriesMap = {
        'chromium': {
            'linux': ['/etc/chromium/policies/managed'],
            'windows': [],
            'macos': []
        },
        'chrome': {
            'linux': ['/etc/opt/chrome/policies/managed'],
            'windows': [],
            'macos': []
        },
        'edge': {
            // not supported in linux (yet?)
            // https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies#extensionsettings
            'linux': [],
            'windows': [],
            'macos': []
        },
        'brave': {
            'linux': ['/etc/brave/policies/managed'],
            'windows': [],
            'macos': []
        },
    }

    // compute all entries we should target
    const currentEntries = []
    targetBrowsers.map(browserName => currentEntries.push(...entriesMap[browserName][operatingSystem]))

    if(operatingSystem == 'linux') {
        // https://support.google.com/chrome/a/answer/7517525?hl=en&ref_topic=7517516
        // https://docs.keeper.io/enterprise-guide/deploying-keeper-to-end-users/keeper-fill/linux/json-policy-deployment-chrome
        
        let filename = `ExtensionSettings.json`
        let content = {
            "ExtensionSettings": {
                [extensionId]: {
                    "installation_mode": "force_installed",
                    "override_update_url": true,
                    "update_url": hostUrl + extensionId + '.xml'
                },
            }
        }
        
        for(let managedPath of currentEntries) {
            // make sure path exists
            if(!await existPromise(managedPath)) {
                await execPromise(`mkdir -p ${managedPath}`)
                await execPromise(`chmod -w ${managedPath}`)
            }
            
            // make sure there's no conflicts
            try { await execPromise(`sudo rm -r ${managedPath}/*`) } catch {}

            // write the extension policy settings to the path
            const filePath = ph.join(managedPath, filename)
            await writePromise(filePath, JSON.stringify(content, undefined, 2))
            entries.push(filePath)
        }
    }
    else if(operatingSystem == 'windows') {
        // todo
    }
    else if(operatingSystem == 'mac') {
        // todo
    }

    return entries
}

// ---- LIBRARY EXPORT ---- //
/**
 * @param {String} extensionPath Path to unpacked extension code
 * @param {String} pathChromiumBasedBrowser Path to a chromium based browser, used for packing
 * @param {String[]} targetBrowsers List of browsers we want to inject for. (chromium, chrome, edge, brave)
 */
async function InjectEnterpriseExtension(extensionPath, pathChromiumBasedBrowser, targetBrowsers = []) {
    console.log(`Creating an enterprise extension for: "${extensionPath}" [${operatingSystem}]`)

    // create private key .pem
    const keyPath = await CreatePrivateKeyFile()
    console.log(`Generated pem key at: "${keyPath}"`)

    // calculate extension id
    const extensionId = await CalculateExtensionId(keyPath)
    console.log(`Extension id is: "${extensionId}"`)

    // pack the extension
    const crxPath = await PackExtension(pathChromiumBasedBrowser, extensionPath, keyPath, extensionId)
    console.log(`Packed extension at: "${crxPath}"`)
    
    // add extension as force installed
    const entryArray = await ForceInstallExtension(extensionId, hostUrl, targetBrowsers)
    console.log(`Extension added to forcelist at: "${entryArray.join(', ')}"`)

    // print a divider for better debugging
    console.log('-'.repeat(process.stdout.columns))
}

function RemoveEnterpriseExtensions(targetBrowsers = []) {
    // todo
}

module.exports = {
    InjectEnterpriseExtension,
    RemoveEnterpriseExtensions,
}

// ---- TEST LIBRARY ---- //
const DummyExtensionPath = require('path').join(__dirname, '../dummy-extension')
const GoogleChromePath = 'google-chrome-stable'
const TargetBrowsers = ['chromium', 'chrome', 'edge', 'brave']
InjectEnterpriseExtension(DummyExtensionPath, GoogleChromePath, TargetBrowsers)