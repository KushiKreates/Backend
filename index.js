const express = require('express');
const axios = require('axios').default;
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const port = 35300;
const usersFile = 'users.json';

// Discord webhook URL
const discordWebhookURL = 'https://discordapp.com/api/webhooks/1248310846086578297/imqo4VsowiMzlIjVbzN0G8YzoGGGM5IhdpxqZMUI6S37CiEoMHkoxtM7NQ8e9aqhZUrQ';

// Middleware
app.use(express.json());
app.use(cookieParser());

// CORS configuration
app.use(cors()); // Allow requests from all origins during development

// Utility function to read users from JSON file
const readUsers = () => {
    try {
        return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    } catch (err) {
        return [];
    }
};

// Utility function to write users to JSON file
const writeUsers = (users) => {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
};

// Function to send error message to Discord webhook
const sendErrorToDiscord = async (error, endpoint) => {
    const embed = {
        title: 'API Error',
        description: `Error occurred at endpoint: ${endpoint}`,
        color: 16711680, // Red color
        fields: [
            {
                name: 'Error Message',
                value: error.message || 'Unknown error'
            }
        ],
        timestamp: new Date()
    };

    try {
        await axios.post(discordWebhookURL, {
            embeds: [embed]
        });
    } catch (webhookError) {
        console.error('Failed to send error message to Discord webhook:', webhookError);
    }
};

// Function to send success message to Discord webhook
const sendOkay = async (endpoint) => {
    const embed = {
        title: 'API Healthy! 🟢',
        description: `Request given to: ${endpoint} has worked!`,
        color: 51968, // Green color
        fields: [
            {
                name: '🟢 Online',
                value: 'Works fine!'
            }
        ],
        timestamp: new Date()
    };

    try {
        await axios.post(discordWebhookURL, {
            embeds: [embed]
        });
    } catch (webhookError) {
        console.error('Failed to send success message to Discord webhook:', webhookError);
    }
};

// Route to sign up a new user
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;

    const users = readUsers();

    const existingUser = users.find(user => user.username === username);
    if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = { username, password: hashedPassword };
    users.push(newUser);
    writeUsers(users);

    res.json({ message: 'User signed up successfully' });
});

// Route to log in a user and generate JWT token
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const users = readUsers();

    const user = users.find(user => user.username === username);
    if (!user) {
        return res.status(400).json({ error: 'Invalid username or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Generate JWT token
    const token = jwt.sign({ username }, 'your_secret_key', { expiresIn: '1h' });

    res.cookie('token', token, { httpOnly: true });
    res.json({ message: 'User logged in successfully', token });
});

// Proxmox API configuration
const proxmoxConfig = {
    baseURL: 'https://81.169.237.72:8006/api2/json/nodes/h3066910',
    httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Ignore SSL certificate issues
    headers: {
        'Authorization': 'PVEAPIToken=API@pve!front-end=a9094682-9fd4-4bd0-ab13-5dffc4617d6d',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
};

// Route to fetch container specifications
app.get('/lxc/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const apiUrl = `${proxmoxConfig.baseURL}/lxc/${id}/status/current`;

        const response = await axios.get(apiUrl, {
            ...proxmoxConfig
        });

        const containerSpecs = {
            vcpu: response.data.data.cpus,
            cpuUsage: response.data.data.cpu,
            memoryUsage: response.data.data.mem,
            maxMemory: response.data.data.maxmem,
            diskUsage: response.data.data.disk,
            maxDisk: response.data.data.maxdisk,
            network: response.data.data.netin,
            maxNetwork: response.data.data.netout
        };

        res.json(containerSpecs);
        await sendOkay(`/lxc/${id}`);
    } catch (error) {
        console.error(error);
        await sendErrorToDiscord(error, `/lxc/${id}`);
        res.status(500).json({ error: 'Failed to fetch container specifications' });
    }
});

// Route to fetch all LXC containers
app.get('/lxc', async (req, res) => {
    try {
        const apiUrl = `${proxmoxConfig.baseURL}/lxc`;

        const response = await axios.get(apiUrl, {
            ...proxmoxConfig
        });

        res.json(response.data);
        await sendOkay('/lxc');
    } catch (error) {
        console.error(error);
        await sendErrorToDiscord(error, '/lxc');
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Route to stop the LXC container
app.post('/lxc/stop/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const apiUrl = `${proxmoxConfig.baseURL}/lxc/${id}/status/stop`;

        console.log(`Attempting to stop container ${id}`);

        const response = await axios.post(apiUrl, null, proxmoxConfig);

        console.log(`Successfully stopped container ${id}`);
        res.json({ message: `Successfully stopped container ${id}` });
        await sendOkay(`/lxc/stop/${id}`);
    } catch (error) {
        console.error(`Failed to stop container ${id}:`, error);
        await sendErrorToDiscord(error, `/lxc/stop/${id}`);
        res.status(500).json({ error: `Failed to stop container ${id}` });
    }
});

// Route to start the LXC container
app.post('/lxc/start/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const apiUrl = `${proxmoxConfig.baseURL}/lxc/${id}/status/start`;

        console.log(`Attempting to start container ${id}`);

        const response = await axios.post(apiUrl, null, proxmoxConfig);

        console.log(`Successfully started container ${id}`);
        res.json({ message: `Successfully started container ${id}` });
        await sendOkay(`/lxc/start/${id}`);
    } catch (error) {
        console.error(`Failed to start container ${id}:`, error);
        await sendErrorToDiscord(error, `/lxc/start/${id}`);
        res.status(500).json({ error: `Failed to start container ${id}` });
    }
});

// Route to control LXC container power state
app.post('/lxc/power/:id/:state', async (req, res) => {
    const { id, state } = req.params;

    try {
        let apiUrl = '';
        if (state === 'start') {
            apiUrl = `${proxmoxConfig.baseURL}/lxc/${id}/status/start`;
            console.log(`Attempting to start container ${id}`);
        } else if (state === 'stop') {
            apiUrl = `${proxmoxConfig.baseURL}/lxc/${id}/status/stop`;
            console.log(`Attempting to stop container ${id}`);
        } else {
            return res.status(400).json({ error: 'Invalid state. Must be "start" or "stop".' });
        }

        const response = await axios.post(apiUrl, null, proxmoxConfig);

        console.log(`Successfully ${state === 'start' ? 'started' : 'stopped'} container ${id}`);
        res.json({ message: `Successfully ${state === 'start' ? 'started' : 'stopped'} container ${id}` });
        await sendOkay(`/lxc/power/${id}/${state}`);
    } catch (error) {
        console.error(`Failed to ${state === 'start' ? 'start' : 'stop'} container ${id}:`, error);
        await sendErrorToDiscord(error, `/lxc/power/${id}/${state}`);
        res.status(500).json({ error: `Failed to ${state === 'start' ? 'start' : 'stop'} container ${id}` });
    }
});

// Route to check if the node is online or offline
app.get('/node/status', async (req, res) => {
    try {
        const apiUrl = `${proxmoxConfig.baseURL}/status`;

        const response = await axios.get(apiUrl, {
            ...proxmoxConfig
        });

        const nodeStatus = response.data.data ? 'online' : 'offline';
        res.json({ status: nodeStatus });
        await sendOkay('/node/status');
    } catch (error) {
        console.error(error);
        await sendErrorToDiscord(error, '/node/status');
        res.status(500).json({ error: 'Failed to fetch node status' });
    }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, 'your_secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Invalid token:', error);
        return res.status(400).json({ error: 'Invalid token.' });
    }
};

// Example protected route - requires JWT token
app.get('/protected', verifyToken, (req, res) => {
    res.json({ message: 'This is a protected route.', user: req.user });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
