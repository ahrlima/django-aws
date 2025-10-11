import os, boto3, psycopg2

def handler(event, context):
    rds = boto3.client("rds", region_name=os.getenv("AWS_REGION", "us-east-1"))
    token = rds.generate_db_auth_token(
        DBHostname=os.environ["DB_HOST"],
        Port=5432,
        DBUsername=os.environ["DB_USER"]
    )
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        user=os.environ["DB_USER"],
        password=token,
        sslmode="require",
        dbname=os.environ["DB_NAME"],
    )
    cur = conn.cursor()
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
        "GRANT writer_role TO app_user;"
    ]
    for s in statements:
        cur.execute(s)
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "ok"}
