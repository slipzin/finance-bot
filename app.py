from flask import Flask, request, jsonify
from google import genai
import os

app = Flask(__name__)

# O SDK do Google busca automaticamente a variável GEMINI_API_KEY
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json
    # Ajuste conforme o formato que sua Evolution API envia
    mensagem = data.get('data', {}).get('message', {}).get('conversation', '')
    
    if not mensagem:
        return jsonify({"status": "no_message"})

    prompt = f"""
    Analise a frase: '{mensagem}'.
    Extraia valor (float), categoria (string) e descricao (string).
    Responda APENAS em formato JSON puro, sem markdown.
    Exemplo: {{"valor": 50.0, "categoria": "comida", "descricao": "almoco"}}
    """
    
    # Chamada para o modelo Gemini 3.5 Flash (rápido e barato)
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=prompt
    )
    
    resultado = response.text
    print(f"Resultado processado: {resultado}")
    
    return jsonify({"status": "success", "data": resultado})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))