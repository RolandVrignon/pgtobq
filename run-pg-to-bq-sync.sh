#!/bin/bash

# Script to run pg-to-bq-sync service
# This script is meant to be called by cron every 5 minutes during business hours

# Set the working directory
cd /home/ubuntu

# Check if it's business hours (8h-19h Monday to Friday)
current_hour=$(date +%H)
current_day=$(date +%u)  # 1=Monday, 7=Sunday

# Only run during business hours (8-19) and weekdays (1-5)
if [ "$current_day" -ge 1 ] && [ "$current_day" -le 5 ] && [ "$current_hour" -ge 8 ] && [ "$current_hour" -lt 19 ]; then
    echo "$(date): Starting pg-to-bq-sync"

    # Remove the container if it exists
    docker-compose rm -f pg-to-bq-sync 2>/dev/null || true

    # Run the sync service
    docker-compose run --rm pg-to-bq-sync

    echo "$(date): pg-to-bq-sync completed"
else
    echo "$(date): Outside business hours, skipping sync"
fi