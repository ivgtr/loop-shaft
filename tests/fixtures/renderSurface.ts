/** Browser-only authoring surface: the same world/text split as the live game. */
export function createRenderSurface() {
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;left:-2000px;top:0;width:960px;height:640px';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:960px;height:540px';
  const ui = document.createElement('canvas');
  ui.style.cssText = 'position:absolute;inset:0;width:960px;height:640px';
  stage.append(canvas, ui); document.body.append(stage);
  const capture = () => {
    const image = document.createElement('canvas'); image.width = 960; image.height = 640;
    const ctx = image.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, 960, 540); ctx.drawImage(ui, 0, 0, 960, 640);
    return image.toDataURL();
  };
  return { canvas, ui, capture, dispose: () => stage.remove() };
}
