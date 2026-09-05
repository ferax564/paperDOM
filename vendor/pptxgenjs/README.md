# PptxGenJS export runtime

This directory contains the MIT-licensed **PptxGenJS 4.0.1 ESM distribution and TypeScript declarations**, copied from the published npm package. Source content is unchanged except newline normalization to LF. The upstream MIT license and embedded Microsoft runtime notice are retained. SHA256.json records these exact files.

Upstream: https://github.com/gitbrent/PptxGenJS/tree/v4.0.1

The complete npm package declares image-size, whose published versions are affected by GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq. This ESM distribution only statically imports JSZip and does not include image-size or its ICNS/JXL/HEIF parsers. We vendor only this distribution and depend directly on JSZip; the vulnerable parser dependency is removed entirely, not patched around or excluded from the audit gate.

PaperDOM passes embedded PNG/JPEG/GIF/SVG image data and never offers PptxGenJS's general path/URL image loading as a user API. The unused upstream `require('sizeof')` code is inside an upstream comment block. No image-size module is installed or bundled.

To update: inspect the upstream license/imports, copy these three files from the selected package, normalize newlines, regenerate hashes, and rerun export/OOXML/browser tests and the production dependency audit. Do not blindly vendor a new build or its transitive dependencies. Third-party generated sources are excluded from our application lint rules; their integrity and exported behavior are tested.
