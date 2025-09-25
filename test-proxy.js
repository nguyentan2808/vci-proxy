const fetch = require('node-fetch');

async function testHttpProxy() {
    console.log('Testing HTTP proxy...');
    
    try {
        const targetUrl = 'https://httpbin.org/json';
        const proxyUrl = `http://localhost:3001/proxy?target=${encodeURIComponent(targetUrl)}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        console.log('✅ HTTP proxy test successful');
        console.log('Response:', data);
    } catch (error) {
        console.log('❌ HTTP proxy test failed:', error.message);
    }
}

async function testHttpProxyWithPath() {
    console.log('Testing HTTP proxy with path preservation...');
    
    try {
        // Test with a URL that has a path and query parameters
        const targetUrl = 'https://httpbin.org/get?param1=value1&param2=value2';
        const proxyUrl = `http://localhost:3001/proxy?target=${encodeURIComponent(targetUrl)}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        console.log('✅ HTTP proxy path preservation test successful');
        console.log('Target URL:', targetUrl);
        console.log('Args received by server:', data.args);
        
        // Verify that query parameters were preserved
        if (data.args && data.args.param1 === 'value1' && data.args.param2 === 'value2') {
            console.log('✅ Query parameters preserved correctly');
        } else {
            console.log('❌ Query parameters not preserved correctly');
        }
        
    } catch (error) {
        console.log('❌ HTTP proxy path test failed:', error.message);
    }
}

function testWebSocketProxy() {
    console.log('Testing WebSocket proxy...');
    
    const WebSocket = require('ws');
    
    try {
        const targetWsUrl = 'wss://echo.websocket.org';
        const proxyWsUrl = `ws://localhost:3001/ws?target=${encodeURIComponent(targetWsUrl)}`;
        
        const ws = new WebSocket(proxyWsUrl);
        
        ws.on('open', () => {
            console.log('✅ WebSocket proxy connection opened');
            ws.send('Hello WebSocket!');
        });
        
        ws.on('message', (data) => {
            console.log('✅ WebSocket proxy test successful');
            console.log('Received:', data.toString());
            ws.close();
        });
        
        ws.on('error', (error) => {
            console.log('❌ WebSocket proxy test failed:', error.message);
        });
        
        setTimeout(() => {
            if (ws.readyState !== WebSocket.CLOSED) {
                ws.close();
                console.log('⏰ WebSocket test timeout');
            }
        }, 5000);
        
    } catch (error) {
        console.log('❌ WebSocket proxy test failed:', error.message);
    }
}

async function runTests() {
    console.log('🚀 Starting proxy tests...\n');
    
    await testHttpProxy();
    console.log('');
    await testHttpProxyWithPath();
    console.log('');
    testWebSocketProxy();
}

runTests();