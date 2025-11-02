import { NextRequest, NextResponse } from 'next/server'

export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">API Connection Tests</h1>
        
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Test All Connections</h2>
            <button
              id="test-all"
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
            >
              Test All APIs
            </button>
            <div id="results" className="mt-4"></div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Individual Tests</h2>
            <div className="space-y-2">
              <button
                onClick={() => testAPI('/api/test/supabase', 'Supabase')}
                className="bg-green-500 text-white px-4 py-2 rounded mr-2 hover:bg-green-600"
              >
                Test Supabase
              </button>
              <button
                onClick={() => testAPI('/api/test/openai', 'OpenAI')}
                className="bg-purple-500 text-white px-4 py-2 rounded mr-2 hover:bg-purple-600"
              >
                Test OpenAI
              </button>
              <button
                onClick={() => testAPI('/api/test/openrouter', 'OpenRouter')}
                className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
              >
                Test OpenRouter
              </button>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        async function testAPI(url, name) {
          const button = event.target;
          button.disabled = true;
          button.textContent = 'Testing...';
          
          try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.success) {
              button.className = 'bg-green-500 text-white px-4 py-2 rounded';
              button.textContent = '✅ ' + name + ' OK';
            } else {
              button.className = 'bg-red-500 text-white px-4 py-2 rounded';
              button.textContent = '❌ ' + name + ' Failed';
              console.error(name + ' error:', data.error);
            }
          } catch (error) {
            button.className = 'bg-red-500 text-white px-4 py-2 rounded';
            button.textContent = '❌ ' + name + ' Error';
            console.error(name + ' error:', error);
          }
          
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Test ' + name;
          }, 3000);
        }
        
        document.getElementById('test-all').addEventListener('click', async () => {
          const button = document.getElementById('test-all');
          const results = document.getElementById('results');
          
          button.disabled = true;
          button.textContent = 'Testing...';
          results.innerHTML = '<p>Testing all connections...</p>';
          
          try {
            const res = await fetch('/api/test/all');
            const data = await res.json();
            
            let html = '<div class="space-y-2">';
            for (const [service, result] of Object.entries(data.results)) {
              const status = result.success ? '✅' : '❌';
              const color = result.success ? 'text-green-600' : 'text-red-600';
              html += '<div class="' + color + '">' + status + ' ' + service.toUpperCase() + ': ' + (result.message || result.error) + '</div>';
            }
            html += '</div>';
            
            results.innerHTML = html;
            
            if (data.success) {
              button.className = 'bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600';
              button.textContent = '✅ All Tests Passed!';
            } else {
              button.className = 'bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600';
              button.textContent = '❌ Some Tests Failed';
            }
          } catch (error) {
            results.innerHTML = '<p class="text-red-600">Error: ' + error.message + '</p>';
            button.className = 'bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600';
            button.textContent = '❌ Test Error';
          }
          
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Test All APIs';
          }, 5000);
        });
      ` }} />
    </div>
  )
}

