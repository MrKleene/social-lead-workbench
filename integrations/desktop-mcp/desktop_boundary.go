package main

import (
 "fmt"
 "os"
 "context"
 "github.com/modelcontextprotocol/go-sdk/mcp"
)
func desktopMode() string { return os.Getenv("CRM_DESKTOP_MODE") }
func desktopValidateEnvironment() error {
 mode:=desktopMode()
 switch mode {case "LOGIN","COLLECT","INBOX","DM","COMMENT","PREFLIGHT","VERIFY":default:return fmt.Errorf("DESKTOP_MODE_REQUIRED")}
 // No inherited legacy switch can silently widen this process's surface.
 for _,key:=range []string{"CRM_INBOX_INSPECTION_ONLY","CRM_EXACT_DM_ONLY","CRM_EXACT_DM_ENABLED","CRM_EXACT_REPLY_ENABLED","CRM_EXACT_VERIFY_ONLY","CRM_EXACT_PREFLIGHT_ONLY","CRM_ACCOUNT_INSPECTION_ONLY","CRM_REPLY_SELECTION_DIAGNOSTIC_ONLY","CRM_DM_CONVERSATION_INSPECTION_ONLY","CRM_DM_ENTRY_INSPECTION_ONLY"}{if os.Getenv(key)!="" {return fmt.Errorf("LEGACY_MODE_OVERRIDE_FORBIDDEN")}}
 flags:=map[string][]string{"INBOX":{"CRM_INBOX_INSPECTION_ONLY"},"DM":{"CRM_EXACT_DM_ONLY","CRM_EXACT_DM_ENABLED"},"COMMENT":{"CRM_EXACT_REPLY_ENABLED"},"PREFLIGHT":{"CRM_EXACT_PREFLIGHT_ONLY"},"VERIFY":{"CRM_EXACT_VERIFY_ONLY"}}
 for _,key:=range flags[mode]{if err:=os.Setenv(key,"1");err!=nil{return err}}
 return nil
}
func registerDesktopTools(server *mcp.Server, appServer *AppServer) {
 switch desktopMode(){
 case "LOGIN":return
 case "INBOX":registerInboxInspection(server)
 case "DM":registerExactDMTool(server)
 case "COMMENT":registerExactReplyTools(server)
 case "PREFLIGHT":registerExactPreflightTool(server)
 case "VERIFY":registerExactVerifyTool(server)
 case "COLLECT":registerDesktopReadTools(server,appServer)
 default:panic("DESKTOP_MODE_REQUIRED")
 }
}
// READ_TOOLS are copied mechanically from the existing collector registration
// during the build, with an extra finite-window check before browser access.
func registerDesktopReadTools(server *mcp.Server, appServer *AppServer) {
/* READ_TOOLS */
}
