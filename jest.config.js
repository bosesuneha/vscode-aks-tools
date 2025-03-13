module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    moduleFileExtensions: ["ts", "tsx", "js"],
    testMatch: ["**/tests/**/utils/*.test.ts"], // Ensure test files follow this pattern
    transformIgnorePatterns: ["/node_modules/"],
};
