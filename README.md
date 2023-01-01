A nodejs library that:
1. Takes a path of a chromium (unpacked) extension folder as input
2. Packs the extension
3. Calculates the extension ID
4. Hosts the extension in local host as an enterprise extension server
5. Adds the extension id as a forced installed extension for all browsers

End-Goal:
- We'll be able to have a manifest v3 extension that can also use manifest v2 webRequest (blocking) functionality
- The force installed extension will also be impossible to remove by the user (making it more production ready)
- Gives us better control overall, and more permissions. Usually, chrome/brave/edge treats such extensions nicely.

TODO:
[ ] add support for all chromium based browsers
[ ] add windows support
[ ] add macos support