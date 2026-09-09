module.exports = {
  packagerConfig: {
    asar: true,
    extraResource: ['desktop/generated/demo-env'],
    ignore: [/^\/\.env\.demo\.local$/, /^\/desktop\/generated(?:\/|$)/, /^\/tests(?:\/|$)/, /^\/\.git(?:\/|$)/],
  },
  makers: [
    { name: '@electron-forge/maker-squirrel', config: { name: 'aetheria_demo', setupExe: 'Aetheria Demo Setup.exe' } },
    { name: '@electron-forge/maker-zip', platforms: ['win32'] },
  ],
};
