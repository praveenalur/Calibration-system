import sys
import os
import datetime
import pandas as pd
import numpy as np
import psycopg2
from sqlalchemy import create_engine
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

def main():
    if len(sys.argv) < 2:
        print("Usage: python forecast.py <gauge_id>")
        sys.exit(1)
        
    gauge_id = sys.argv[1]
    
    db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/capacity_system")
    # For sqlalchemy, we need postgresql:// instead of postgres://
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
        
    engine = create_engine(db_url)
    
    try:
        # Load historical monthly log data
        query = f"SELECT * FROM gauge_monthly_log WHERE gauge_id = '{gauge_id}' ORDER BY year_month ASC"
        df = pd.read_sql(query, engine)
        
        if len(df) < 3:
            print(f"Not enough data to run ML for gauge {gauge_id}. Needs at least 3 months.")
            sys.exit(0)
            
        # Feature Engineering
        df['actual_production'] = df['actual_production'].astype(float)
        df['production_plan'] = df['production_plan'].astype(float)
        
        # Anomaly Detection (Isolation Forest)
        # We look for abnormal months in actual_production
        iso = IsolationForest(contamination=0.1, random_state=42)
        df['anomaly'] = iso.fit_predict(df[['actual_production']])
        
        # Filter out anomalies for training
        train_df = df[df['anomaly'] == 1].copy()
        
        if len(train_df) < 2:
            train_df = df.copy() # fallback if too many anomalies
            
        # Time as numeric feature for regression
        # Convert YYYY-MM to an integer sequence
        train_df['time_idx'] = np.arange(len(train_df))
        
        # Train Linear Regression for utilisation trend
        model = LinearRegression()
        X_train = train_df[['time_idx']]
        y_train = train_df['utilisation_pct']
        model.fit(X_train, y_train)
        
        # Predict next month (which is current len + 1)
        next_time_idx = len(df)
        
        # Handle warnings about feature names by using DataFrame
        X_pred = pd.DataFrame({'time_idx': [next_time_idx]})
        pred_util = model.predict(X_pred)[0]
        
        # Get gauge profile for expiry prediction
        query_profile = f"SELECT * FROM gauge_profiles WHERE gauge_id = '{gauge_id}'"
        profile_df = pd.read_sql(query_profile, engine)
        
        pred_life_consumed = 0.0
        pred_expiry_date = None
        
        if len(profile_df) > 0:
            profile = profile_df.iloc[0]
            max_cap = float(profile.get('max_capacity', 100000))
            produced = float(profile.get('produced_quantity', 0))
            
            # Simple assumption: linear usage rate based on recent average
            recent_avg_prod = df['actual_production'].tail(3).mean()
            if recent_avg_prod > 0:
                months_left = (max_cap - produced) / recent_avg_prod
                expiry = datetime.date.today() + datetime.timedelta(days=30 * months_left)
                pred_expiry_date = expiry.strftime('%Y-%m-%d')
            
            if max_cap > 0:
                pred_life_consumed = ((produced + recent_avg_prod) / max_cap) * 100
                
        # Calculate a pseudo confidence score
        confidence = min(0.95, len(train_df) * 0.1)
        
        # Next month string
        today = datetime.date.today()
        # Handle month rollover correctly
        next_month_num = today.month + 1 if today.month < 12 else 1
        next_year_num = today.year if today.month < 12 else today.year + 1
        forecast_month_str = f"{next_year_num}-{next_month_num:02d}"
        
        now_str = datetime.datetime.now().isoformat()
        
        insert_query = """
            INSERT INTO ml_forecasts 
            (gauge_id, forecast_month, predicted_utilisation_pct, predicted_life_consumed_pct, predicted_expiry_date, confidence_score, model_version, generated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        # Use simple psycopg2 for insert to bypass sqlalchemy typing complexity
        conn_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/capacity_system")
        conn = psycopg2.connect(conn_url)
        cursor = conn.cursor()
        cursor.execute(insert_query, (
            gauge_id, forecast_month_str, float(pred_util), float(pred_life_consumed), 
            pred_expiry_date, float(confidence), "LinearReg+IsoForest_v1", now_str
        ))
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"ML Forecast saved successfully for {gauge_id}.")
        
    except Exception as e:
        print(f"Error in ML pipeline: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
