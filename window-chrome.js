export function profileWindowChrome(platform = process.platform) {
  return {
    frame: platform === 'darwin',
    ...(platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
    } : {}),
    closable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    resizable: true,
  };
}
