package xiaohongshu

import (
 "encoding/json"
 "regexp"
 "strings"
)

// Only the two observed public identifiers are carried across the typed boundary.
// This is independent of SubComments, which represents the enclosing discussion.
type CommentReplyTarget struct {
 ID string `json:"id"`
 UserInfo *CommentReplyTargetUser `json:"userInfo,omitempty"`
}
type CommentReplyTargetUser struct { UserID string `json:"userId"` }
var replyTargetID=regexp.MustCompile(`^[A-Za-z0-9_-]{1,150}$`)

func (c *Comment) UnmarshalJSON(data []byte) error {
 type plain Comment
 var fields map[string]json.RawMessage
 if err:=json.Unmarshal(data,&fields);err!=nil{return err}
 raw:=fields["targetComment"]
 // encoding/json otherwise matches fields case-insensitively. Accept only observed spelling.
 for key:=range fields {if strings.EqualFold(key,"targetComment"){delete(fields,key)}}
 body,err:=json.Marshal(fields);if err!=nil{return err}
 var decoded plain
 if err=json.Unmarshal(body,&decoded);err!=nil{return err}
 *c=Comment(decoded)
 var target map[string]json.RawMessage
 if json.Unmarshal(raw,&target)!=nil{return nil}
 var id string
 if json.Unmarshal(target["id"],&id)!=nil||!replyTargetID.MatchString(id)||id==c.ID{return nil}
 c.TargetComment=&CommentReplyTarget{ID:id}
 var user map[string]json.RawMessage;var userID string
 if json.Unmarshal(target["userInfo"],&user)==nil&&json.Unmarshal(user["userId"],&userID)==nil&&replyTargetID.MatchString(userID){c.TargetComment.UserInfo=&CommentReplyTargetUser{UserID:userID}}
 return nil
}
