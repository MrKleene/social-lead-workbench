/** Exercise the public shadcn UI; never set app state from page.evaluate. */
export async function selectOption(control, selection) {
  if(await control.evaluate(e=>e.tagName==='SELECT'))return control.selectOption(selection);
  await control.click();
  const page=control.page();
  const options=page.getByRole('option');
  let target;
  if(typeof selection==='object'&&selection.label!==undefined)target=page.getByRole('option',{name:selection.label,exact:true});
  else if(typeof selection==='object'&&selection.index!==undefined)target=options.nth(selection.index);
  else {const value=typeof selection==='object'?selection.value:selection;target=page.locator('[role="option"][data-value='+JSON.stringify(String(value))+']');}
  await target.click();
}
export async function controlValue(control) {return control.evaluate(e=>e.matches('[data-slot="select-trigger"]')?e.dataset.value:e.value);}
