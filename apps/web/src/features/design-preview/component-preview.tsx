import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {PreviewShell} from './preview-shell';
export function ComponentPreview(){
 const [enabled,setEnabled]=useState(false);
 return <PreviewShell><section className="candidate-components"><header className="candidate-heading"><div><p className="candidate-eyebrow">公共组件 · 交互验收</p><h1>组件与状态</h1><p>仅演示本地交互，不调用业务服务。</p></div></header><section><h2>按钮</h2><div className="component-examples"><Button className="candidate-primary">保存设置</Button><Button variant="outline">次要操作</Button><Button disabled>暂不可用</Button><Button disabled aria-busy="true"><Spinner/>保存中…</Button></div><p>焦点环清晰；禁用保留文字对比度；加载不改变控件尺寸。</p></section><section><h2>开关</h2><div className="component-examples"><label>本地示例 · {enabled?'已开启':'已关闭'}<Switch aria-label="本地示例开关" checked={enabled} onCheckedChange={setEnabled}/></label><label>能力未接通<Switch aria-label="能力未接通" disabled/></label></div></section><section><h2>字段</h2><div className="component-examples"><label>方案名称<Input placeholder="请输入名称"/></label><label>校验失败<Input aria-invalid="true" aria-describedby="preview-field-error" defaultValue=""/><span id="preview-field-error">请填写方案名称</span></label><label>暂不可编辑<Input disabled value="已有选择" readOnly/></label></div></section><section><h2>页面反馈</h2><div className="component-feedback"><div role="status"><Spinner/>正在读取，请稍候</div><div><strong>暂无记录</strong><p>完成配置后，新记录会显示在这里。</p></div><div className="candidate-warning" role="alert"><strong>保存失败，原配置保持不变</strong><p>检查连接后重试，避免重复提交。</p></div><div className="candidate-warning"><strong>结果待核查</strong><p>额度与去重锁继续保留，不能直接重发。</p></div></div></section></section></PreviewShell>;
}
