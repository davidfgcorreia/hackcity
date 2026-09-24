FROM python:3.12-slim
WORKDIR /code
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# DuckDB extensions baked into the image so ingestion works offline
RUN python -c "import duckdb; c=duckdb.connect(); c.install_extension('postgres'); c.install_extension('spatial')"
COPY . .
CMD ["uvicorn", "analytics.api:app", "--host", "0.0.0.0", "--port", "8100"]
