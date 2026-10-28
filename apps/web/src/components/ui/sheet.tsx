"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";

const SheetState = React.createContext<{open:boolean;change:(open:boolean)=>void;depth:number}|null>(null);
export function useDialogLayer() { return 51 + (React.useContext(SheetState)?.depth ?? 0) * 2; }
function Sheet({open:controlled,defaultOpen=false,onOpenChange, ...props}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const parent=React.useContext(SheetState);
  const [local,setLocal]=React.useState(defaultOpen),open=controlled??local,depth=(parent?.depth??0)+1;
  const change=(next:boolean)=>{setLocal(next);onOpenChange?.(next);};
  return <SheetState.Provider value={{open,change,depth}}><SheetPrimitive.Root data-slot="sheet" {...props} open={open} onOpenChange={change}/></SheetState.Provider>;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  onPointerDown,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  const state=React.useContext(SheetState);
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      onPointerDown={event=>{
        onPointerDown?.(event);
        if(document.querySelector('[data-slot=select-content][data-state=open], [data-slot=popover-content][data-state=open], [data-slot=alert-dialog-content][data-state=open]'))return;
        if(event.target!==event.currentTarget||event.defaultPrevented||event.button!==0)return;
        // The clicked backdrop belongs to exactly one dialog, including nesting.
        event.stopPropagation();event.preventDefault();state?.change(false);
      }}
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
      style={{...props.style,zIndex:50+(state?.depth??1)*2}}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  onEscapeKeyDown,
  ref:forwardedRef,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  const state=React.useContext(SheetState),content=React.useRef<HTMLDivElement|null>(null);
  const setContentRef=React.useCallback((node:HTMLDivElement|null)=>{content.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;},[forwardedRef]);
  // Route Escape to the dialog containing focus. Nested portals must not let a
  // stale parent layer listener close the whole stack during rapid transitions.
  React.useLayoutEffect(()=>{
    if(!state?.open)return;
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      if(document.querySelector('[data-slot=select-content][data-state=open], [data-slot=popover-content][data-state=open], [data-slot=alert-dialog-content][data-state=open]'))return;
      const focused=event.target instanceof Element?event.target.closest('[data-slot="sheet-content"]'):null;
      const top=focused??Array.from(document.querySelectorAll<HTMLElement>('[data-slot="sheet-content"][data-state="open"]')).filter(node=>node.getAttribute('aria-hidden')!=='true').at(-1);
      if(top!==content.current)return;
      event.stopImmediatePropagation();
      onEscapeKeyDown?.(event);
      if(!event.defaultPrevented)state.change(false);
      event.preventDefault();
    };
    window.addEventListener('keydown',escape,true);
    return()=>window.removeEventListener('keydown',escape,true);
  },[state,onEscapeKeyDown]);
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-layout="modal"
        ref={setContentRef}
        className={cn(
          "simple-dialog fixed z-50 flex flex-col gap-4 bg-background shadow-lg",
          className,
        )}
        {...props}
        style={{...props.style,zIndex:51+(state?.depth??1)*2}}
        onEscapeKeyDown={(event) => {
          // Window capture above owns dialog Escape; other overlay types keep theirs.
          event.preventDefault();
        }}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs size-8 grid place-items-center opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <XIcon className="size-4" />
            <span className="sr-only">关闭</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
