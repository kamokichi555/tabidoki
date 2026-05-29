import globals from "globals";
export default [
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker }
    },
    rules: { "no-undef": "error" }
  }
];
