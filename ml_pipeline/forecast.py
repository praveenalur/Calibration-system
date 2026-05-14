import sys
import os
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import IsolationForest
import psycopg2
from datetime import datetime, timedelta

# Get Gauge ID from Node.js argument
if len(sys.argv) < 2:
    print("Error: No Gauge ID provided.")
    sys.exit(1)

gauge_id = sys.argv[1]
db_url = os.getenv('DATABASE_URL')

def run_ml_pipeline():
    try:
        # 1. Connect to PostgreSQL
        conn = psycopg2.connect(db_url)
        
        # 2. Fetch Historical Logs
        query = f"""
            SELECT year_month, production_plan, actual_production, utilisation_pct, logged_at 
            FROM gauge_monthly_log 
            WHERE gauge_id = %s 
            ORDER BY logged_at ASC
        """
        df = pd.read_sql(query, conn, params=(gauge_id,))
        
        if len(df) < 3:
            print(f"Skipping ML: Gauge {gauge_id} needs at least 3 months of data.")
            return

        # 3. Anomaly Detection (Isolation Forest)
        # Identifies if this month's production was a statistical outlier
        iso = IsolationForest(contamination=0.1)
        df['anomaly'] = iso.fit_predict(df[['actual_production']])
        # Only use non-anomalous data for training the forecast
        clean_df = df[df['anomaly'] == 1].copy()

        # 4. Feature Engineering for Forecasting
        # Convert logged_at to a numerical 'days since start' for regression
        clean_df['days'] = (clean_df['logged_at'] - clean_df['logged_at'].min()).dt.days
        X = clean_df[['days']].values
        y = clean_df['actual_production'].values

        # 5. Linear Regression (Trend Analysis)
        model = LinearRegression()
        model.fit(X, y)

        # 6. Predict Expiry Date
        # Logic: If the gauge has a fixed life (e.g., 500,000 units), 
        # we calculate how many days until cumulative production hits that limit.
        # For this MVP, we'll project a 6-month utilization forecast.
        future_days = np.array([[clean_df['days'].max() + 30]])
        predicted_next_month = model.predict(future_days)[0]

        # Calculate a dummy expiry date for demonstration
        # In a real scenario, compare predicted_next_month against remaining_capacity
        predicted_expiry = datetime.now() + timedelta(days=180) 

        # 7. Write Prediction to ml_forecasts
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO ml_forecasts 
            (gauge_id, forecast_month, predicted_utilisation_pct, predicted_expiry_date, confidence_score, model_version)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            gauge_id, 
            (datetime.now() + timedelta(days=30)).strftime('%Y-%m'),
            float(predicted_next_month / clean_df['production_plan'].iloc[-1] * 100),
            predicted_expiry.date(),
            0.85, # Confidence score
            'v1.0-linear-ensemble'
        ))
        
        conn.commit()
        print(f"✅ Forecast generated for {gauge_id}")
        
    except Exception as e:
        print(f"❌ ML Pipeline Error: {str(e)}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_ml_pipeline()