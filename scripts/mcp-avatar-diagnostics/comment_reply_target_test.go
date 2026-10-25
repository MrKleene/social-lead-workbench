package xiaohongshu
import("encoding/json";"strings";"testing")
func TestReplyTargetRoundTripSynthetic(t *testing.T){
 raw:=`{"id":"root","content":"synthetic","userInfo":{"userId":"u1"},"subComments":[{"id":"child","content":"synthetic","userInfo":{"userId":"u2"},"targetComment":{"id":"other-child","userInfo":{"userId":"u3","nickname":"DO_NOT_EXPORT"},"url":"SECRET_VALUE"}}]}`
 var c Comment;if err:=json.Unmarshal([]byte(raw),&c);err!=nil{t.Fatal(err)}
 if c.TargetComment!=nil||c.SubComments[0].TargetComment.ID!="other-child"||c.SubComments[0].TargetComment.UserInfo.UserID!="u3"{t.Fatal("target lost")}
 b,err:=json.Marshal(c);if err!=nil{t.Fatal(err)}
 if strings.Contains(string(b),"SECRET_VALUE")||strings.Contains(string(b),"DO_NOT_EXPORT"){t.Fatal("unexpected target fields leaked")}
 var round Comment;if json.Unmarshal(b,&round)!=nil||round.SubComments[0].TargetComment.ID!="other-child"{t.Fatal("wire lost target")}
}
func TestReplyTargetOptionalInvalidSynthetic(t *testing.T){
 for _,target:=range []string{`null`,`[]`,`"bad"`,`{}`,`{"id":42}`,`{"id":"self"}`,`{"id":"https://invalid"}`,`{"ID":"other"}`} {
  var c Comment;if err:=json.Unmarshal([]byte(`{"id":"self","content":"synthetic","targetComment":`+target+`}`),&c);err!=nil||c.TargetComment!=nil{t.Fatal("optional metadata damaged valid comment")}
 }
 for _,user:=range []string{`null`,`[]`,`{"userId":42}`,`{"userId":"https://invalid"}`} {
  var c Comment;if err:=json.Unmarshal([]byte(`{"id":"self","targetComment":{"id":"other","userInfo":`+user+`}}`),&c);err!=nil||c.TargetComment==nil||c.TargetComment.UserInfo!=nil{t.Fatal("optional user validation")}
 }
 var c Comment;if json.Unmarshal([]byte(`{"id":42,"targetComment":{"id":"other"}}`),&c)==nil{t.Fatal("required identity validation weakened")}
 if err:=json.Unmarshal([]byte(`{"id":"self","TargetComment":{"id":"other"}}`),&c);err!=nil||c.TargetComment!=nil{t.Fatal("unobserved alias accepted")}
}
