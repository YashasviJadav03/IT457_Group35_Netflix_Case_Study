#!/usr/bin/env python3
"""Automated HTTP Latency & Throughput Benchmarking Tool.

Course: IT457 Cloud Computing | Group: 35
Assignee: Member 3 (Cloud Modernization & Analytics Lead)
Deliverable: Deliverable 3 — Performance Metrics, Cost & Effort Comparison

This script benchmarks the Netflix Watchlist application across different
deployment architectures (Local Docker vs EC2 Lift-and-Shift vs EC2 + RDS).
It executes concurrent HTTP requests, calculates response times, percentiles
(p50, p90, p95, p99), throughput (requests/sec), and outputs a formatted report.

Zero external dependencies: uses only Python 3 standard library.

Usage:
    python run_benchmarks.py --target http://localhost:5000 --requests 500 --concurrency 10
    python run_benchmarks.py --target http://52.66.238.5:5000 --requests 500 --concurrency 10 --label "EC2 + AWS RDS"
"""

import argparse
import json
import math
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Netflix App Latency & Throughput Benchmark Suite"
    )
    parser.add_argument(
        "--target",
        type=str,
        default="http://localhost:5000",
        help="Base URL of application (default: http://localhost:5000)",
    )
    parser.add_argument(
        "--endpoint",
        type=str,
        default="/api/watchlist",
        help="Endpoint to benchmark (default: /api/watchlist)",
    )
    parser.add_argument(
        "--requests",
        "-n",
        type=int,
        default=500,
        help="Total number of requests to issue (default: 500)",
    )
    parser.add_argument(
        "--concurrency",
        "-c",
        type=int,
        default=10,
        help="Number of concurrent client workers (default: 10)",
    )
    parser.add_argument(
        "--label",
        type=str,
        default="Phase 3: AWS RDS Modernized",
        help="Architecture label for this benchmark run",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default=None,
        help="Optional path to save JSON results summary",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="Per-request HTTP timeout in seconds (default: 10.0)",
    )
    return parser.parse_args()


def single_request(url, timeout):
    """Executes a single HTTP GET request and returns (status_code, latency_ms, error)."""
    start_time = time.perf_counter()
    status_code = 0
    error_msg = None

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "NetflixBenchmarkTool/1.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.getcode()
            # Read body to accurately include network transfer time
            response.read()
    except urllib.error.HTTPError as e:
        status_code = e.code
    except Exception as e:
        error_msg = str(e)
    finally:
        latency_ms = (time.perf_counter() - start_time) * 1000.0

    return status_code, latency_ms, error_msg


def percentile(data, p):
    """Calculates the p-th percentile of sorted data."""
    if not data:
        return 0.0
    k = (len(data) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return data[int(k)]
    d0 = data[int(f)] * (c - k)
    d1 = data[int(c)] * (k - f)
    return d0 + d1


def run_benchmark(target_url, endpoint, total_requests, concurrency, timeout, label):
    full_url = target_url.rstrip("/") + "/" + endpoint.lstrip("/")
    print("=" * 70)
    print(f" NETFLIX BENCHMARK: {label}")
    print("=" * 70)
    print(f" Target URL:        {full_url}")
    print(f" Total Requests:    {total_requests}")
    print(f" Concurrency Level: {concurrency} workers")
    print(f" Request Timeout:   {timeout}s")
    print("-" * 70)
    print(" Executing benchmark, please wait...")

    latencies = []
    status_codes = {}
    errors = []

    wall_start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [
            executor.submit(single_request, full_url, timeout)
            for _ in range(total_requests)
        ]

        completed = 0
        for future in as_completed(futures):
            code, lat, err = future.result()
            latencies.append(lat)
            status_codes[code] = status_codes.get(code, 0) + 1
            if err:
                errors.append(err)

            completed += 1
            if completed % max(1, total_requests // 10) == 0 or completed == total_requests:
                pct = (completed / total_requests) * 100
                sys.stdout.write(f"\r Progress: {completed}/{total_requests} ({pct:5.1f}%)")
                sys.stdout.flush()

    wall_duration = time.perf_counter() - wall_start
    print("\n" + "-" * 70)

    # Process metrics
    latencies.sort()
    success_count = status_codes.get(200, 0)
    error_count = total_requests - success_count
    throughput_rps = total_requests / wall_duration if wall_duration > 0 else 0

    mean_lat = statistics.mean(latencies) if latencies else 0
    stddev_lat = statistics.stdev(latencies) if len(latencies) > 1 else 0
    min_lat = latencies[0] if latencies else 0
    max_lat = latencies[-1] if latencies else 0
    p50_lat = percentile(latencies, 50)
    p90_lat = percentile(latencies, 90)
    p95_lat = percentile(latencies, 95)
    p99_lat = percentile(latencies, 99)

    # Print Formatted Report
    print(" BENCHMARK RESULTS")
    print("=" * 70)
    print(f" Architecture Label:       {label}")
    print(f" Total Elapsed Time:       {wall_duration:.2f} seconds")
    print(f" Throughput:               {throughput_rps:.2f} requests/second")
    print(f" Successful Requests:      {success_count}/{total_requests} ({(success_count/total_requests)*100:.1f}%)")
    print(f" Failed Requests:          {error_count} ({(error_count/total_requests)*100:.1f}%)")
    print("-" * 70)
    print(" LATENCY DISTRIBUTION (Connection + Server Execution)")
    print("-" * 70)
    print(f"   Fastest (Min):          {min_lat:8.2f} ms")
    print(f"   Average (Mean):         {mean_lat:8.2f} ms")
    print(f"   50th Percentile (p50):  {p50_lat:8.2f} ms")
    print(f"   90th Percentile (p90):  {p90_lat:8.2f} ms")
    print(f"   95th Percentile (p95):  {p95_lat:8.2f} ms")
    print(f"   99th Percentile (p99):  {p99_lat:8.2f} ms")
    print(f"   Slowest (Max):          {max_lat:8.2f} ms")
    print(f"   Standard Deviation:     {stddev_lat:8.2f} ms")
    print("-" * 70)
    print(f" HTTP Status Code Breakdown: {json.dumps(status_codes)}")
    if errors:
        print(f" Error Sample:             {errors[:3]}")
    print("=" * 70)

    summary = {
        "label": label,
        "url": full_url,
        "total_requests": total_requests,
        "concurrency": concurrency,
        "wall_time_seconds": round(wall_duration, 3),
        "requests_per_second": round(throughput_rps, 2),
        "success_rate_pct": round((success_count / total_requests) * 100, 2),
        "latency_ms": {
            "min": round(min_lat, 2),
            "mean": round(mean_lat, 2),
            "p50": round(p50_lat, 2),
            "p90": round(p90_lat, 2),
            "p95": round(p95_lat, 2),
            "p99": round(p99_lat, 2),
            "max": round(max_lat, 2),
            "stddev": round(stddev_lat, 2),
        },
        "status_codes": status_codes,
    }
    return summary


def main():
    args = parse_arguments()
    summary = run_benchmark(
        target_url=args.target,
        endpoint=args.endpoint,
        total_requests=args.requests,
        concurrency=args.concurrency,
        timeout=args.timeout,
        label=args.label,
    )

    if args.output_json:
        with open(args.output_json, "w") as f:
            json.dump(summary, f, indent=2)
        print(f"[INFO] Summary written to {args.output_json}")


if __name__ == "__main__":
    main()
