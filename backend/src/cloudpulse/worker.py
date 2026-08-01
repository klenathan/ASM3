import json

from cloudpulse.analytics import build_summary_report


def main() -> None:
    print(json.dumps(build_summary_report()))


if __name__ == "__main__":
    main()
