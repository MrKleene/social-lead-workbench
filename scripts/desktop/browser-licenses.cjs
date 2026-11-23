'use strict';
// Writes the license files that ship beside the pinned Chromium build.
// Chromium itself is BSD-3-Clause; its bundled third-party notices are the
// generated LICENSES.chromium.html from the Electron distribution. Electron's
// own MIT license is kept separately so the browser directory is self-contained.
const fs=require('node:fs'),path=require('node:path');
const electronDist=path.join(path.dirname(require.resolve('electron/package.json')),'dist');
const CHROMIUM_LICENSE=`Chromium 148.0.7778.215
Copyright 2015 The Chromium Authors

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google LLC nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Chromium bundles additional third-party components. Their license texts are
in CHROMIUM-LICENSES.html in this directory. Electron 45.2.3 is licensed under
the MIT License; see ELECTRON-LICENSE.txt.
`;
function writeBrowserLicenses(directory){
 fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'BROWSER-LICENSES.txt'),CHROMIUM_LICENSE);
 fs.copyFileSync(path.join(electronDist,'LICENSE'),path.join(directory,'ELECTRON-LICENSE.txt'));
 fs.copyFileSync(path.join(electronDist,'LICENSES.chromium.html'),path.join(directory,'CHROMIUM-LICENSES.html'));
 console.log(JSON.stringify({browserLicenses:true,directory}));
}
module.exports={writeBrowserLicenses};
