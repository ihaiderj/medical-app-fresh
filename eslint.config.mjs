import expo from 'eslint-config-expo/flat.js'

export default [
  ...expo,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      'src/screens/mr/DoctorsScreen_backup.tsx',
    ],
  },
]

