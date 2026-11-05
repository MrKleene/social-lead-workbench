package xiaohongshu
import("encoding/json";"strings";"testing")
func TestSchemaOmitsAllPayloadValues(t *testing.T){
 v:=frameSchema(`{"type":132,"body":{"content":"private-message","token":"secret-value","id":"user-id"},"code":99999999}`,1)
 b,_:=json.Marshal(v);for _,s:=range []string{"private-message","secret-value","user-id","99999999"}{if strings.Contains(string(b),s){t.Fatal("retained value")}}
 if v["protocolNumbers"].(map[string]float64)["$.type"]!=132{t.Fatal("missing discriminator")}
}
func TestSchemaBoundsAndBinary(t *testing.T){for _,v:=range []map[string]any{frameSchema(strings.Repeat("a",70000),1),frameSchema("private",2)}{if _,ok:=v["fields"];ok{t.Fatal("unsafe parse")}}}
