import sys
import os
import datetime
import pandas as pd
import numpy as np
import psycopg2
from sklearn.linear_model import LinearRegression

def main():
    # ---- 1. Input ----
    if len(sys.argv) < 2:
        print("Usage: python forecast.py <gauge_id>")
        sys.exit(1)

    gauge_id = sys.argv[1]
    db_url = os.getenv("DATABASE_URL")

    if not db_url:
        print("DATABASE_URL not set")
        sys.exit(1)

    try:
        # ---- 2. Connect DB ----
        conn = psycopg2.connect(db_url)

        # ---- 3. Load historical data safely ----
        query = """
        SELECT actual_production, logged_at
        FROM gauge_monthly_log
        WHERE gauge_id = %s
        ORDER BY logged_at ASC
        """
        df = pd.read_sql(query, conn, params=(gauge_id,))

        if len(df) < 3:
            print(f"Not enough data for ML forecast for {gauge_id}")
            conn.close()
            sys.exit(0)

        # ---- 4. Preprocessing ----
        df['actual_production'] = df['actual_production'].astype(float)
        df['time_idx'] = np.arange(len(df))

        # ---- 5. Train model ----
        model = LinearRegression()
        model.fit(df[['time_idx']], df['actual_production'])

        # ---- 6. Predict next value ----
        next_idx = len(df)
        predicted_production = model.predict([[next_idx]])[0]

        # ---- 7. Load gauge profile ----
        profile_query = """
        SELECT max_capacity, produced_quantity
        FROM gauge_profiles
        WHERE gauge_id = %s
        """
        profile_df = pd.read_sql(profile_query, conn, params=(gauge_id,))

        predicted_life_consumed = 0.0
        predicted_expiry_date = None

        if len(profile_df) > 0:
            profile = profile_df.iloc[0]
            max_capacity = float(profile.get('max_capacity', 0))
            produced_quantity = float(profile.get('produced_quantity', 0))

            if max_capacity > 0:
                predicted_life_consumed = ((produced_quantity + predicted_production) / max_capacity) * 100

                if predicted_production > 0:
                    months_left = (max_capacity - produced_quantity) / predicted_production
                    expiry_date = datetime.date.today() + datetime.timedelta(days=int(months_left * 30))
                    predicted_expiry_date = expiry_date.strftime('%Y-%m-%d')

        # ---- 8. Forecast metadata ----
        today = datetime.date.today()
        next_month = today.month + 1 if today.month < 12 else 1
        next_year = today.year if today.month < 12 else today.year + 1
        forecast_month = f"{next_year}-{next_month:02d}"

        confidence_score = min(0.95, len(df) * 0.1)
        now = datetime.datetime.now().isoformat()

        # ---- 9. Insert into DB ----
        insert_query = """
        INSERT INTO ml_forecasts
        (gauge_id, forecast_month, predicted_utilisation_pct,
         predicted_life_consumed_pct, predicted_expiry_date,
         confidence_score, model_version, generated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """

        cursor = conn.cursor()
        cursor.execute(insert_query, (
            gauge_id,
            forecast_month,
            float(predicted_production),
            float(predicted_life_consumed),
            predicted_expiry_date,
            float(confidence_score),
            "LinearRegression_v1",
            now
        ))

        conn.commit()
        cursor.close()
        conn.close()

        print(f"Forecast saved successfully for {gauge_id}")

    except Exception as e:
        print(f"ML pipeline error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()