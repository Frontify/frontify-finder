# Frontify Finder

Authenticate, search and access Frontify assets data from any secure web app.

**This package is tightly coupled with the [FrontifyAuthenticator](https://github.com/Frontify/frontify-authenticator) package (@frontify/frontify-authenticator) as it's being used as an internal dependency of the Frontify Finder.**

# Install

There are three possible ways of installing or requiring the Frontify Finder.

## NPM

Installing the latest published package on a third party app is as simple as running `npm i @frontify/frontify-finder` and requiring the main class either via CommonJs or as an ES module.

```js
// CommonJs require
const FrontifyFinder = require('@frontify/frontify-finder');
```

**or**

```js
// ESM import
import { create, logout } from '@frontify/frontify-finder';
```

## CDN

Alternatively, in case you're not relying on npm packages in your web app, you can also require the minified JS script directly by using a CDN such as UNPKG. You can find the latest [Frontify Finder](https://unpkg.com/@frontify/frontify-finder@latest/dist/index.js) source code and import it to your project you by requiring it via a `<script>` HTML element.

```html
<script src="https://unpkg.com/@frontify/frontify-finder@latest/dist/index.js"></script>
```

You may want to require a specific version. To do so you only have to change the word `latest` with the specific version you wish to use (ie. v2.0.0).

To make use of the available methods in the script all you have to do is use the `FrontifyFinder` object references attached to the `window`.

Example:

```js
FrontifyFinder.open(...);
```

**or**

```js
window.FrontifyFinder.open(...);
```

## LOCAL

To install any package locally doesn't differ greatly from the CDN use case. You can use the link mentioned above [here](https://unpkg.com/@frontify/frontify-finder@latest/dist/index.js) to download the files contents, save it to your local instance and require via `<script>` HTML element making the `src` address point to your local file.

```html
<script src="<PATH_TO_FILE>/<FILENAME>.js"></script>
```

Like mentioned in the CDN case, if may want to require a specific version, all you have to do is change the word `latest` with the specific version you wish to use (ie. v2.0.0).

You must be aware that, in this case, the latest code won't be automatically updated so it relies on manual downloads everytime you want to have a new version come into effect within your web app.
