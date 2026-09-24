"""MobiCascais realised service spreadsheets, 31 Aug–6 Sep 2026 (all rows are Cascais)."""
import pandas as pd

from analytics.config import DATA
from analytics.db import file_info, logged, replace_table

FOLDER = DATA / "Dados para Desafio 11 BUS Bunching"


def _snake(c: str) -> str:
    import re
    import unicodedata

    c = unicodedata.normalize("NFKD", str(c)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", c.lower()).strip("_")


def run(d) -> None:
    src = FOLDER / "Oferta realizada - linhas M01 a M36.xlsx"
    with logged("bus26", "bus26.services_m01_m36", "all rows; local Europe/Lisbon times", file_info(src)) as log:
        df = pd.read_excel(src)
        log["rows_read"] = len(df)
        df.columns = [_snake(c) for c in df.columns]
        df["data"] = pd.to_datetime(df["data"]).dt.date.astype(str)
        for c in ("hora_teorica_partida", "hora_real_partida"):
            df[c] = df[c].astype(str)
        d.register("m1_df", df)
        log["rows_kept"] = replace_table(d, "bus26.services_m01_m36", """
            SELECT *,
              timezone('Europe/Lisbon', TRY_CAST(data || ' ' || hora_teorica_partida AS TIMESTAMP)) AS planned_departure,
              timezone('Europe/Lisbon', TRY_CAST(data || ' ' || hora_real_partida AS TIMESTAMP)) AS actual_departure
            FROM m1_df WHERE linha IS NOT NULL AND data <> 'NaT'""")

    src = FOLDER / "Oferta realizada - linhas M37 a M44.xlsx"
    with logged("bus26", "bus26.services_m37_m44", "all rows; local Europe/Lisbon times; no planned times", file_info(src)) as log:
        df = pd.read_excel(src)
        log["rows_read"] = len(df)
        df.columns = [_snake(c) for c in df.columns]
        d.register("m2_df", df)
        log["rows_kept"] = replace_table(d, "bus26.services_m37_m44", """
            SELECT * REPLACE (timezone('Europe/Lisbon', partidaefetiva) AS partidaefetiva,
                              timezone('Europe/Lisbon', chegadaefetiva) AS chegadaefetiva,
                              timezone('Europe/Lisbon', ultima_obliteracao) AS ultima_obliteracao)
            FROM m2_df""")
