const devlog = (message) => {
    if (process.env.NODE_ENV !== 'production') {
        const date = new Date().toLocaleTimeString();
        console.log(message);
    }
};

module.exports = { devlog };
