import sys
from pathlib import Path

# Add backend/ directory to sys.path so that `import data_store` works
sys.path.insert(0, str(Path(__file__).parent))
