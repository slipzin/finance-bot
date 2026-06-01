from flask import Flask, request, jsonify
from openai import OpenAI
import os

app = Flask(__name__)
# Certifique-se de configurar a variável de ambiente OPENAI_API_KEY no servidor
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json
    # O formato depende da estrutura da Evolution API
    mensagem = data.get('data', {}).get('message', {}).get('conversation', '')
    sender = data.get('data', {}).get('key', {}).get('remoteJid', '')

    if not mensagem:
        return jsonify({"status": "ignored"})

    prompt = f"Analise o gasto: '{mensagem}'. Retorne APENAS um JSON: {{'valor': 0.0, 'categoria': '...', 'descricao': '...'}}"
    
    resposta = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}]
    )
    
    # Aqui você salvaria no Supabase (omitido para brevidade)
    print(f"Salvo: {resposta.choices[0].message.content} do usuário {sender}")
    
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))