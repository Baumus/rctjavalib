// Define the custom error class
class RecoverableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RecoverableError';
    }
}

// Create a utility function to determine if an error is an instance of RecoverableError
function isRecoverableError(err) {
    return err instanceof RecoverableError;
}

module.exports = {
    RecoverableError,
    isRecoverableError
};
