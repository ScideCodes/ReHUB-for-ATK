import { expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createKeyboardSettings } from "../../devices/keyboardSettings";
import { SaveStatus,KeyboardSaveContext } from "./SaveStatus";
it("never shows saved for a stale value, local field, disconnected device or mock",()=>{
 const settings=createKeyboardSettings();
 const render=(value:number,hardware=true,mock=false)=>renderToStaticMarkup(<KeyboardSaveContext.Provider value={{settings,hardware,mock,retry:vi.fn(),receipts:{pollingRate:{status:"saved",value}}}}><SaveStatus fields={["pollingRate"]}/></KeyboardSaveContext.Provider>);
 expect(render(1000)).toContain("Saved to keyboard");
 expect(render(2000)).toContain("Local only - not sent to device");
 expect(render(1000,false)).not.toContain("Saved to keyboard");
 expect(render(1000,false,true)).toContain("Applied to mock");
});
