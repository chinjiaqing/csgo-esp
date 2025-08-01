import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
    { ignores: ['**/node_modules', '**/dist', '**/out','bin/**/*','electron.builder.js'] },
    tseslint.configs.recommended,
    eslintPluginVue.configs['flat/recommended'],
    {
        files: ['**/*.vue'],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                },
                extraFileExtensions: ['.vue'],
                parser: tseslint.parser
            }
        }
    },
    {
        files: ['**/*.{ts,mts,tsx,vue,mjs}'],
        rules: {
            'vue/require-default-prop': 'off',
            'vue/multi-word-component-names': 'off',
            'vue/block-lang': [
                'error',
                {
                    script: {
                        lang: 'ts'
                    }
                }
            ],
            endOfLine: 'on'
        }
    },
    eslintConfigPrettier
)
