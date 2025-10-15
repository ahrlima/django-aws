import json
import logging
import os
from typing import Any, Dict

import boto3
from botocore.config import Config
import psycopg2

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
SECRETS_CONFIG = Config(connect_timeout=5, read_timeout=5, retries={"max_attempts": 1})
CONNECT_KWARGS: Dict[str, Any] = {
    "sslmode": "require",
    "connect_timeout": 5,
}


def handler(event, context):
    try:
        secrets = boto3.client("secretsmanager", region_name=AWS_REGION, config=SECRETS_CONFIG)
        secret_value = secrets.get_secret_value(SecretId=os.environ["DB_SECRET_ARN"])
        credentials = json.loads(secret_value["SecretString"])
        password = credentials["password"]
        username = credentials.get("username", os.environ["DB_USER"])

        conn = psycopg2.connect(
            host=os.environ["DB_HOST"],
            user=username,
            password=password,
            dbname=os.environ["DB_NAME"],
            **CONNECT_KWARGS,
        )
        try:
            statements = [
                "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='readonly_role') THEN CREATE ROLE readonly_role; END IF; END $$;",
                "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='writer_role') THEN CREATE ROLE writer_role; END IF; END $$;",
                "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='migrator_role') THEN CREATE ROLE migrator_role; END IF; END $$;",
                "GRANT CONNECT ON DATABASE appdb TO readonly_role;",
                "GRANT USAGE ON SCHEMA public TO readonly_role;",
                "GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_role;",
                "GRANT CONNECT ON DATABASE appdb TO writer_role;",
                "GRANT USAGE ON SCHEMA public TO writer_role;",
                "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO writer_role;",
                "GRANT CONNECT ON DATABASE appdb TO migrator_role;",
                "GRANT USAGE ON SCHEMA public TO migrator_role;",
                "GRANT CREATE, ALTER, DROP ON SCHEMA public TO migrator_role;",
                "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_user') THEN CREATE ROLE app_user WITH LOGIN; END IF; END $$;",
                "GRANT writer_role TO app_user;",
            ]
            with conn.cursor() as cur:
                for statement in statements:
                    cur.execute(statement)
            conn.commit()
        finally:
            conn.close()

        return {"status": "ok"}
    except Exception:
        LOGGER.exception("db-init failed")
        raise
