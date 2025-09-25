const fetch = require("node-fetch");

async function testVietcapAPI() {
    console.log("Testing VietCap API through proxy...");

    try {
        // Test the actual API endpoint used in the client
        const targetUrl = "https://trading.vietcap.com.vn/api/price/symbols/getByGroup?group=VN30";
        const proxyUrl = `http://localhost:3001/proxy?target=${encodeURIComponent(targetUrl)}`;

        console.log("Target URL:", targetUrl);
        console.log("Proxy URL:", proxyUrl);

        const response = await fetch(proxyUrl);

        if (!response.ok) {
            console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
            const errorText = await response.text();
            console.log("Error response:", errorText);
            return;
        }

        const data = await response.json();

        console.log("✅ VietCap API test successful");
        console.log("Response type:", typeof data);
        console.log("Response length:", Array.isArray(data) ? data.length : "Not an array");

        if (Array.isArray(data) && data.length > 0) {
            console.log("First item:", data[0]);
        }
    } catch (error) {
        console.log("❌ VietCap API test failed:", error.message);
    }
}

async function testVietcapPostAPI() {
    console.log("\nTesting VietCap POST API through proxy...");

    try {
        const targetUrl = "https://trading.vietcap.com.vn/api/price/symbols/getList";
        const proxyUrl = `http://localhost:3001/proxy?target=${encodeURIComponent(targetUrl)}`;

        const testSymbols = ["VIC", "VHM", "VRE"];

        console.log("Target URL:", targetUrl);
        console.log("Test symbols:", testSymbols);

        const response = await fetch(proxyUrl, {
            method: "POST",
            headers: {
                accept: "application/json, text/plain, */*",
                "content-type": "application/json",
                "device-id": "test-device-id",
            },
            body: JSON.stringify({ symbols: testSymbols }),
            credentials: "include", // Test with credentials like the client
        });

        if (!response.ok) {
            console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
            const errorText = await response.text();
            console.log("Error response:", errorText);
            return;
        }

        const data = await response.json();

        console.log("✅ VietCap POST API test successful");
        console.log("Response type:", typeof data);
        console.log("Response length:", Array.isArray(data) ? data.length : "Not an array");

        if (Array.isArray(data) && data.length > 0) {
            console.log("First item symbol:", data[0]?.listingInfo?.symbol || "Symbol not found");
        }
    } catch (error) {
        console.log("❌ VietCap POST API test failed:", error.message);
    }
}

async function runVietcapTests() {
    console.log("🚀 Testing VietCap APIs through proxy...\n");

    await testVietcapAPI();
    await testVietcapPostAPI();
}

runVietcapTests();
