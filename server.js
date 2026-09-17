const express = require("express");
const path = require("path");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || "123456";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const accounts = {};
const clients = {};

for (let i = 1; i <= 5; i++) {
    accounts[i] = {
        number: i,
        status: "DISCONNECTED",
        qr: null,
        phone: null,
        name: null,
        error: null,
        connectedAt: null
    };
}

function createClient(number) {

    if (clients[number]) {
        return clients[number];
    }

    console.log(`Starting WhatsApp ${number}...`);

    const client = new Client({

        authStrategy: new LocalAuth({
            clientId: `whatsapp-${number}`,
            dataPath: path.join(
                __dirname,
                ".whatsapp_sessions"
            )
        }),

        puppeteer: {
            headless: true,

            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        }
    });

    clients[number] = client;

    client.on("qr", async (qr) => {

        console.log(
            `REAL QR RECEIVED - WHATSAPP ${number}`
        );

        try {

            const qrImage =
                await QRCode.toDataURL(qr, {
                    errorCorrectionLevel: "H",
                    margin: 2,
                    width: 500
                });

            accounts[number].qr = qrImage;
            accounts[number].status =
                "WAITING_FOR_SCAN";
            accounts[number].error = null;

        } catch (error) {

            accounts[number].status = "ERROR";
            accounts[number].error =
                error.message;
        }
    });

    client.on("authenticated", () => {

        console.log(
            `WhatsApp ${number} authenticated`
        );

        accounts[number].status =
            "AUTHENTICATED";

        accounts[number].qr = null;
        accounts[number].error = null;
    });

    client.on("ready", () => {

        console.log(
            `WhatsApp ${number} CONNECTED`
        );

        accounts[number].status =
            "CONNECTED";

        accounts[number].qr = null;
        accounts[number].error = null;

        accounts[number].connectedAt =
            new Date().toISOString();

        try {

            if (client.info) {

                accounts[number].phone =
                    client.info.wid?.user || null;

                accounts[number].name =
                    client.info.pushname || null;
            }

        } catch (error) {
            console.log(
                "Could not read account information"
            );
        }
    });

    client.on("auth_failure", (message) => {

        console.log(
            `WhatsApp ${number} authentication failed`
        );

        accounts[number].status =
            "AUTH_FAILED";

        accounts[number].qr = null;
        accounts[number].error =
            String(message);
    });

    client.on("disconnected", (reason) => {

        console.log(
            `WhatsApp ${number} disconnected:`,
            reason
        );

        accounts[number].status =
            "DISCONNECTED";

        accounts[number].qr = null;
        accounts[number].phone = null;
        accounts[number].name = null;
        accounts[number].connectedAt = null;
        accounts[number].error =
            reason ? String(reason) : null;

        delete clients[number];
    });

    return client;
}


/*
LOGIN
*/

app.post("/api/login", (req, res) => {

    if (req.body.password === PASSWORD) {

        return res.json({
            success: true
        });
    }

    res.status(401).json({
        success: false,
        error: "Wrong password"
    });
});


/*
CONNECT
*/

app.post(
    "/api/accounts/:number/connect",
    async (req, res) => {

        const number =
            Number(req.params.number);

        if (
            !Number.isInteger(number) ||
            number < 1 ||
            number > 5
        ) {
            return res.status(400).json({
                error: "Account must be 1-5"
            });
        }

        try {

            const client =
                createClient(number);

            if (
                accounts[number].status ===
                "CONNECTED"
            ) {
                return res.json({
                    success: true,
                    status: "CONNECTED"
                });
            }

            accounts[number].status =
                "STARTING";

            accounts[number].qr = null;
            accounts[number].error = null;

            await client.initialize();

            res.json({
                success: true,
                status:
                    accounts[number].status
            });

        } catch (error) {

            console.error(error);

            accounts[number].status =
                "ERROR";

            accounts[number].error =
                error.message;

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);


/*
GET STATUS
*/

app.get(
    "/api/accounts/:number",
    (req, res) => {

        const number =
            Number(req.params.number);

        if (
            !Number.isInteger(number) ||
            number < 1 ||
            number > 5
        ) {
            return res.status(400).json({
                error: "Account must be 1-5"
            });
        }

        res.json(accounts[number]);
    }
);


/*
GET ALL ACCOUNTS
*/

app.get("/api/accounts", (req, res) => {

    res.json(
        Object.values(accounts)
    );
});


/*
DISCONNECT
*/

app.post(
    "/api/accounts/:number/disconnect",
    async (req, res) => {

        const number =
            Number(req.params.number);

        if (
            !Number.isInteger(number) ||
            number < 1 ||
            number > 5
        ) {
            return res.status(400).json({
                error: "Account must be 1-5"
            });
        }

        const client = clients[number];

        if (client) {

            try {
                await client.logout();
            } catch (error) {

                try {
                    await client.destroy();
                } catch (e) {}
            }

            delete clients[number];
        }

        accounts[number].status =
            "DISCONNECTED";

        accounts[number].qr = null;
        accounts[number].phone = null;
        accounts[number].name = null;
        accounts[number].connectedAt = null;

        res.json({
            success: true
        });
    }
);


/*
HEALTH
*/

app.get("/api/health", (req, res) => {

    res.json({
        online: true,
        accounts: 5
    });
});


app.listen(PORT, () => {

    console.log("");
    console.log(
        "================================"
    );
    console.log(
        "   5 WHATSAPP WEB MANAGER"
    );
    console.log(
        "================================"
    );
    console.log("");

    console.log(
        `Open: http://localhost:${PORT}`
    );

    console.log(
        `Password: ${PASSWORD}`
    );

    console.log("");
});
