module.exports={
 appId:'local.sociallead.desktop',productName:'Social Lead Desktop',
 directories:{app:'.local/desktop-stage',output:'.local/desktop-packages'},
 electronVersion:'45.2.3',npmRebuild:false,nodeGypRebuild:false,
 extraMetadata:{main:'apps/desktop/src/main.cjs',description:'Social Lead local desktop workbench'},
 files:['apps/desktop/src/**','apps/web/dist-desktop/**','runtime/local/**','package.json','!node_modules/**'],
 asar:true,
 electronFuses:{runAsNode:false,enableCookieEncryption:true,enableNodeOptionsEnvironmentVariable:false,enableNodeCliInspectArguments:false,enableEmbeddedAsarIntegrityValidation:true,onlyLoadAppFromAsar:true,grantFileProtocolExtraPrivileges:false,resetAdHocDarwinSignature:true},
 win:{target:[{target:'nsis',arch:['x64']}],extraResources:[{from:'apps/api/dist/native/windows-host.exe',to:'native/windows-host.exe'},{from:'apps/api/dist/native/windows-build.json',to:'native/windows-build.json'}]},
 nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false},
 mac:{target:[{target:'dir',arch:['arm64']}],category:'public.app-category.productivity'},
};
