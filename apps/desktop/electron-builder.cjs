const path=require('node:path');
const native=path.resolve(__dirname,'dist/native',process.platform+'-'+process.arch);
const {NativeResources}=require('./src/native-resources.cjs');
// Signing is opt-in: set CSC_NAME (or CSC_LINK/CSC_KEY_PASSWORD) to sign, leave
// unset for an ad-hoc preview build. Passing `identity: null` would *disable*
// signing even when a certificate is supplied, so the key is omitted instead.
const macIdentity=process.env.CSC_NAME;
module.exports={
 appId:'local.sociallead.desktop',productName:'Social Lead Desktop',
 directories:{app:'.local/desktop-stage',output:'.local/desktop-packages'},
 electronVersion:'45.2.3',electronDist:path.join(path.dirname(require.resolve('electron/package.json')),'dist'),
 beforePack:async context=>{if(context.electronPlatformName!==process.platform||require('builder-util').Arch[context.arch]!==process.arch)throw Error('Build this preview on the target OS and architecture; cross-platform native resources are not verified');if(process.platform==='darwin')new NativeResources(native).inspect();else{const {windowsNative}=require('./src/windows-native.cjs');new NativeResources(native,{windowsCheck:(file,directory)=>windowsNative({isPackaged:false},{operation:directory?'resource-directory':'executable',path:file})}).inspect();}},npmRebuild:false,nodeGypRebuild:false,
 extraResources:process.platform==='darwin'?[{from:native,to:'native/'+process.platform+'-'+process.arch,filter:['desktop-mcp','desktop-supervisor','*-build.json','*-LICENSES.txt','Chromium.app/**/*']}]:[],
 extraMetadata:{main:'apps/desktop/src/main.cjs',description:'Social Lead local desktop workbench'},
 files:['apps/desktop/src/**','apps/web/dist-desktop/**','runtime/local/**','package.json','!node_modules/**'],
 asar:true,
 electronFuses:{runAsNode:false,enableCookieEncryption:true,enableNodeOptionsEnvironmentVariable:false,enableNodeCliInspectArguments:false,enableEmbeddedAsarIntegrityValidation:true,onlyLoadAppFromAsar:true,grantFileProtocolExtraPrivileges:false,resetAdHocDarwinSignature:true},
 win:{artifactName:'Social-Lead-Desktop-${version}-win-${arch}.${ext}',target:[{target:'nsis',arch:['x64']}],extraResources:[{from:native,to:'native/win32-x64',filter:['desktop-mcp.exe','*-build.json','windows-validation.json','*-LICENSES.txt','browser/**/*']},{from:'apps/api/dist/native/windows-host.exe',to:'native/windows-host.exe'},{from:'apps/api/dist/native/windows-build.json',to:'native/windows-build.json'}]},
 nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:false,deleteAppDataOnUninstall:false},
 mac:{...(macIdentity?{identity:macIdentity}:{}),signIgnore:['Contents/Resources/native/.*'],target:[{target:'dmg',arch:['arm64']}],category:'public.app-category.productivity',minimumSystemVersion:'13.0.0',artifactName:'Social-Lead-Desktop-${version}-mac-${arch}.${ext}'},
 dmg:{title:'Social Lead Desktop Preview',contents:[{x:130,y:180,type:'file'},{x:410,y:180,type:'link',path:'/Applications'}]},
};
