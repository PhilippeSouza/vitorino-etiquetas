from pathlib import Path

base = Path(__file__).parent
src = base / "src"
libs = base / "libs"


def ler(caminho):
    return caminho.read_text(encoding="utf-8")


def sem_fechar_script(texto):
    return texto.replace("</script", "<\\/script")


html = ler(src / "index.html")
trocas = {
    "/*ESTILO*/": ler(src / "estilo.css"),
    "/*WORKER*/": sem_fechar_script(ler(libs / "pdf.worker.min.js")),
    "/*PDFJS*/": sem_fechar_script(ler(libs / "pdf.min.js")),
    "/*PDFLIB*/": sem_fechar_script(ler(libs / "pdf-lib.min.js")),
    "/*APP*/": sem_fechar_script(ler(src / "app.js")),
}
for marcador, conteudo in trocas.items():
    html = html.replace(marcador, conteudo, 1)

saida = base / "Montar-Etiquetas.html"
saida.write_text(html, encoding="utf-8")
print(f"{saida.name}: {saida.stat().st_size / 1024:.0f} KB")
