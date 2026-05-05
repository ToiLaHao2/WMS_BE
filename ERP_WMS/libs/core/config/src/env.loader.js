const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../../../../.env');

const result = dotenv.config({ path: envPath });

if (result.error) {
    console.warn("⚠️ Warning: .env file not found at path: ", envPath);
}

const getEnv = (key, defaultValue = null) => {
    const value = process.env[key];

    if (value === undefined || value === null) {
        if (defaultValue !== null) {
            return defaultValue;
        }
        return undefined;
    }

    return value;
};

module.exports = { getEnv };