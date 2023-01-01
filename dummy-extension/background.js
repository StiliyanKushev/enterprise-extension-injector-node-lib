console.log('EXTENSION LOADED')

// if the extension is installed correctly no requests should be working in the browser
chrome.webRequest.onBeforeRequest.addListener(
    details => ({ cancel: true }),
    {urls: ["<all_urls>"]},
    ["blocking"] // should only work if force installed
)

// else if it doesn't work we'll get this in the console:
// Unchecked runtime.lastError: You do not have permission to use blocking webRequest listeners. 
// Be sure to declare the webRequestBlocking permission in your manifest.