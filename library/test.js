const { InjectEnterpriseExtension, RemoveEnterpriseExtensions } = require('./index')

// ---- TEST LIBRARY ---- //
;(async () => {
    const DummyExtensionPath = require('path').join(__dirname, '../dummy-extension')
    const GoogleChromePath = 'google-chrome-stable'
    const TargetBrowsers = ['chromium', 'chrome', 'edge', 'brave']

    console.log('INJECTING ENTERPRISE EXTENSION')
    await InjectEnterpriseExtension(DummyExtensionPath, GoogleChromePath, TargetBrowsers)

    console.log('REMOVING ENTERPRISE EXTENSION IN 1 MINUTE')
    setTimeout(() => RemoveEnterpriseExtensions(TargetBrowsers), 1000 * 60)
})()