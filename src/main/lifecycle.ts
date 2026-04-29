// Tiny shared flag so tray.ts can mark a quit as intentional and
// window.ts's close handler can let it through. Without this the
// close event always preventDefault → hide.
export const lifecycle = {
  isQuitting: false
};
