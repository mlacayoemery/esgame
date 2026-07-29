# One-shot GeoServer seeder image (Python stdlib only - registers coverages + palette styles).
FROM python:3.14-slim
COPY seed.py /seed.py
ENTRYPOINT ["python3", "/seed.py"]
