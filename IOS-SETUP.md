# Gestão de Processos — iOS

Esta branch prepara o sistema para execução como aplicativo iOS com Capacitor.

## Requisitos no Mac

- Node.js LTS
- Xcode
- CocoaPods, quando solicitado pelo Xcode/Capacitor

## Criar o projeto nativo pela primeira vez

No Terminal, dentro da pasta do repositório e com a branch `ios-app` ativa:

```bash
npm install
mkdir -p www
printf '<!doctype html><html><body></body></html>' > www/index.html
npx cap add ios
npx cap sync ios
npx cap open ios
```

O aplicativo usa o sistema web publicado como origem segura HTTPS e mantém o mesmo Supabase, autenticação, RLS e Storage.

## Identificação

- Nome: Gestão de Processos
- Bundle ID: br.ba.seabra.gestaoprocessos
- Plataforma inicial: iOS

## Teste no iPhone

No Xcode:
1. Selecione o projeto App.
2. Em Signing & Capabilities, escolha sua conta Apple/Team.
3. Conecte o iPhone ao Mac.
4. Escolha o iPhone como destino.
5. Clique em Run.

Esta branch é separada da versão web principal. Não mesclar no `main` até a versão iOS ser validada.
