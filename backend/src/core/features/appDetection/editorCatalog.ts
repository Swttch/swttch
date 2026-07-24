import type {
  MacDetection,
  LinuxDetection,
  WindowsDetection,
} from './resolveApp';

/**
 * Single source of truth for the external editors/IDEs we detect, following
 * GitHub Desktop's `editors/{darwin,win32,linux}.ts` catalogs. Each entry carries
 * per-OS detection descriptors; the platform resolver consumes the matching one.
 * `name` is the user-facing label and the value persisted in `openFilesWith`.
 */
export interface EditorCatalogEntry {
  id: string;
  name: string;
  mac?: MacDetection;
  win?: WindowsDetection;
  linux?: LinuxDetection;
}

const JB = ['JetBrains s.r.o.'];

export const EDITOR_CATALOG: EditorCatalogEntry[] = [
  // --- JetBrains family -----------------------------------------------------
  {
    id: 'webstorm',
    name: 'WebStorm',
    mac: { bundleIds: ['com.jetbrains.WebStorm'], appNames: ['WebStorm'] },
    win: {
      jetbrainsProduct: 'WebStorm',
      jetbrainsExeBase: 'webstorm',
      displayNamePrefixes: ['WebStorm'],
      publishers: JB,
    },
    linux: { binaries: ['webstorm'] },
  },
  {
    id: 'intellij',
    name: 'IntelliJ IDEA',
    mac: { bundleIds: ['com.jetbrains.intellij'] },
    win: {
      jetbrainsProduct: 'IntelliJ IDEA',
      jetbrainsExeBase: 'idea',
      displayNamePrefixes: ['IntelliJ IDEA '],
      publishers: JB,
    },
    linux: { binaries: ['idea', 'idea.sh'] },
  },
  {
    id: 'intellij-ce',
    name: 'IntelliJ IDEA Community Edition',
    mac: { bundleIds: ['com.jetbrains.intellij.ce'] },
    win: {
      jetbrainsProduct: 'IntelliJ IDEA Community Edition',
      jetbrainsExeBase: 'idea',
      displayNamePrefixes: ['IntelliJ IDEA Community Edition '],
      publishers: JB,
    },
    linux: { binaries: ['idea-community'] },
  },
  {
    id: 'pycharm',
    name: 'PyCharm',
    mac: { bundleIds: ['com.jetbrains.PyCharm'] },
    win: {
      jetbrainsProduct: 'PyCharm',
      jetbrainsExeBase: 'pycharm',
      displayNamePrefixes: ['PyCharm '],
      publishers: JB,
    },
    linux: { binaries: ['pycharm', 'charm'] },
  },
  {
    id: 'pycharm-ce',
    name: 'PyCharm Community Edition',
    mac: { bundleIds: ['com.jetbrains.pycharm.ce'] },
    win: {
      jetbrainsProduct: 'PyCharm Community Edition',
      jetbrainsExeBase: 'pycharm',
      displayNamePrefixes: ['PyCharm Community Edition'],
      publishers: JB,
    },
    linux: { binaries: ['pycharm-community'] },
  },
  {
    id: 'goland',
    name: 'GoLand',
    mac: { bundleIds: ['com.jetbrains.goland'] },
    win: {
      jetbrainsProduct: 'GoLand',
      jetbrainsExeBase: 'goland',
      displayNamePrefixes: ['GoLand '],
      publishers: JB,
    },
    linux: { binaries: ['goland'] },
  },
  {
    id: 'phpstorm',
    name: 'PhpStorm',
    mac: { bundleIds: ['com.jetbrains.PhpStorm'] },
    win: {
      jetbrainsProduct: 'PhpStorm',
      jetbrainsExeBase: 'phpstorm',
      displayNamePrefixes: ['PhpStorm'],
      publishers: JB,
    },
    linux: { binaries: ['phpstorm'] },
  },
  {
    id: 'rubymine',
    name: 'RubyMine',
    mac: { bundleIds: ['com.jetbrains.RubyMine'] },
    win: {
      jetbrainsProduct: 'RubyMine',
      jetbrainsExeBase: 'rubymine',
      displayNamePrefixes: ['RubyMine '],
      publishers: JB,
    },
    linux: { binaries: ['rubymine'] },
  },
  {
    id: 'clion',
    name: 'CLion',
    mac: { bundleIds: ['com.jetbrains.CLion'] },
    win: {
      jetbrainsProduct: 'CLion',
      jetbrainsExeBase: 'clion',
      displayNamePrefixes: ['CLion '],
      publishers: JB,
    },
    linux: { binaries: ['clion'] },
  },
  {
    id: 'rider',
    name: 'Rider',
    mac: { bundleIds: ['com.jetbrains.rider'] },
    win: {
      jetbrainsProduct: 'JetBrains Rider',
      jetbrainsExeBase: 'rider',
      displayNamePrefixes: ['JetBrains Rider'],
      publishers: JB,
    },
    linux: { binaries: ['rider'] },
  },
  {
    id: 'rustrover',
    name: 'RustRover',
    mac: { bundleIds: ['com.jetbrains.RustRover'] },
    win: {
      jetbrainsProduct: 'RustRover',
      jetbrainsExeBase: 'rustrover',
      displayNamePrefixes: ['RustRover '],
      publishers: JB,
    },
    linux: { binaries: ['rustrover'] },
  },
  {
    id: 'dataspell',
    name: 'DataSpell',
    mac: { bundleIds: ['com.jetbrains.DataSpell'] },
    win: {
      jetbrainsProduct: 'DataSpell',
      jetbrainsExeBase: 'dataspell',
      displayNamePrefixes: ['DataSpell '],
      publishers: JB,
    },
    linux: { binaries: ['dataspell'] },
  },
  {
    id: 'datagrip',
    name: 'DataGrip',
    mac: { bundleIds: ['com.jetbrains.datagrip'] },
    win: {
      jetbrainsProduct: 'DataGrip',
      jetbrainsExeBase: 'datagrip',
      displayNamePrefixes: ['DataGrip '],
      publishers: JB,
    },
    linux: { binaries: ['datagrip'] },
  },
  {
    id: 'aqua',
    name: 'Aqua',
    mac: { bundleIds: ['com.jetbrains.aqua'] },
    win: {
      jetbrainsProduct: 'Aqua',
      jetbrainsExeBase: 'aqua',
      displayNamePrefixes: ['Aqua '],
      publishers: JB,
    },
    linux: { binaries: ['aqua'] },
  },
  {
    id: 'fleet',
    name: 'Fleet',
    mac: { bundleIds: ['Fleet.app'], appNames: ['Fleet'] },
    win: {
      registryKeys: [{ hive: 'HKLM', subKey: 'Fleet' }],
      useDisplayIcon: true,
      displayNamePrefixes: ['Fleet '],
      publishers: JB,
    },
    linux: { binaries: ['fleet'] },
  },
  {
    id: 'android-studio',
    name: 'Android Studio',
    mac: { bundleIds: ['com.google.android.studio'] },
    win: {
      registryKeys: [{ hive: 'HKLM', subKey: 'Android Studio' }],
      executableShims: [
        ['..', 'bin', 'studio64.exe'],
        ['..', 'bin', 'studio.exe'],
      ],
      displayNamePrefixes: ['Android Studio'],
      publishers: ['Google LLC'],
    },
    linux: { binaries: ['studio', 'studio.sh', 'android-studio'] },
  },

  // --- VS Code family & others ---------------------------------------------
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    mac: { bundleIds: ['com.microsoft.VSCode'] },
    win: {
      registryKeys: [
        { hive: 'HKCU', subKey: '{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1' },
        { hive: 'HKCU', subKey: '{D628A17A-9713-46BF-8D57-E671B46A741E}_is1' },
        { hive: 'HKCU', subKey: '{D9E514E7-1A56-452D-9337-2990C0DC4310}_is1' },
        { hive: 'HKLM', subKey: '{EA457B21-F73E-494C-ACAB-524FDE069978}_is1' },
        { hive: 'HKLM', wow64: true, subKey: '{F8A2A208-72B3-4D61-95FC-8A65D340689B}_is1' },
        { hive: 'HKLM', subKey: '{A5270FC5-65AD-483E-AC30-2C276B63D0AC}_is1' },
      ],
      executableShims: [['bin', 'code.cmd'], ['Code.exe']],
      displayNamePrefixes: ['Microsoft Visual Studio Code'],
      publishers: ['Microsoft Corporation'],
    },
    linux: { binaries: ['code'] },
  },
  {
    id: 'vscode-insiders',
    name: 'Visual Studio Code (Insiders)',
    mac: { bundleIds: ['com.microsoft.VSCodeInsiders'] },
    win: {
      registryKeys: [
        { hive: 'HKCU', subKey: '{217B4C08-948D-4276-BFBB-BEE930AE5A2C}_is1' },
        { hive: 'HKLM', subKey: '{1287CAD5-7C8D-410D-88B9-0D1EE4A83FF2}_is1' },
      ],
      executableShims: [['bin', 'code-insiders.cmd'], ['Code - Insiders.exe']],
      displayNamePrefixes: ['Microsoft Visual Studio Code Insiders'],
      publishers: ['Microsoft Corporation'],
    },
    linux: { binaries: ['code-insiders'] },
  },
  {
    id: 'vscodium',
    name: 'VSCodium',
    mac: { bundleIds: ['com.visualstudio.code.oss', 'com.vscodium'] },
    win: {
      registryKeys: [
        { hive: 'HKCU', subKey: '{2E1F05D1-C245-4562-81EE-28188DB6FD17}_is1' },
        { hive: 'HKLM', subKey: '{88DA3577-054F-4CA1-8122-7D820494CFFB}_is1' },
      ],
      executableShims: [['bin', 'codium.cmd'], ['VSCodium.exe']],
      displayNamePrefixes: ['VSCodium'],
      publishers: ['VSCodium', 'Microsoft Corporation'],
    },
    linux: { binaries: ['codium'] },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    mac: { bundleIds: ['com.todesktop.230313mzl4w4u92'] },
    win: {
      registryKeys: [
        { hive: 'HKCU', subKey: '62625861-8486-5be9-9e46-1da50df5f8ff' },
        { hive: 'HKCU', subKey: '{DADADADA-ADAD-ADAD-ADAD-ADADADADADAD}}_is1' },
        { hive: 'HKCU', subKey: '{DBDBDBDB-BDBD-BDBD-BDBD-BDBDBDBDBDBD}}_is1' },
      ],
      useDisplayIcon: true,
      displayNamePrefixes: ['Cursor', 'Cursor (User)'],
      publishers: ['Cursor AI, Inc.', 'Anysphere'],
    },
    linux: { binaries: ['cursor'] },
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    mac: { bundleIds: ['com.exafunction.windsurf'] },
    win: {
      registryKeys: [
        { hive: 'HKCU', subKey: '{5A8B7D94-9B5F-4D1F-93FC-5609F7159349}_is1' },
      ],
      useDisplayIcon: true,
      displayNamePrefixes: ['Windsurf', 'Windsurf (User)'],
      publishers: ['Codeium'],
    },
    linux: { binaries: ['windsurf'] },
  },
  {
    id: 'zed',
    name: 'Zed',
    mac: { bundleIds: ['dev.zed.Zed'] },
    win: {
      registryKeys: [
        { hive: 'HKCU', subKey: '{2DB0DA96-CA55-49BB-AF4F-64AF36A86712}_is1' },
      ],
      useDisplayIcon: true,
      displayNamePrefixes: ['Zed'],
      publishers: ['Zed Industries'],
    },
    linux: { binaries: ['zed', 'zeditor'] },
  },
  {
    id: 'sublime',
    name: 'Sublime Text',
    mac: {
      bundleIds: ['com.sublimetext.4', 'com.sublimetext.3', 'com.sublimetext.2'],
    },
    win: {
      registryKeys: [
        { hive: 'HKLM', subKey: 'Sublime Text_is1' },
        { hive: 'HKLM', subKey: 'Sublime Text 3_is1' },
      ],
      executableShims: [['subl.exe']],
      displayNamePrefixes: ['Sublime Text'],
      publishers: ['Sublime HQ Pty Ltd'],
    },
    linux: { binaries: ['subl', 'sublime_text'] },
  },
  {
    id: 'nova',
    name: 'Nova',
    mac: { bundleIds: ['com.panic.Nova'] },
  },
  {
    id: 'xcode',
    name: 'Xcode',
    mac: { bundleIds: ['com.apple.dt.Xcode'], appNames: ['Xcode'] },
  },
  {
    id: 'emacs',
    name: 'Emacs',
    mac: { bundleIds: ['org.gnu.Emacs'] },
    linux: { binaries: ['emacs'] },
  },
  {
    id: 'neovim',
    name: 'Neovim',
    linux: { binaries: ['nvim'] },
  },
];
