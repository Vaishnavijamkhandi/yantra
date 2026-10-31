import os
import onnxruntime as ort

base = r"D:\cyber-risk-platform\backend"
os.chdir(base)
files = [
    r"app\ml\models\asset_isolation_forest.onnx",
    r"app\ml\models\vuln_logistic_regression.onnx",
    r"app\ml\models\vuln_random_forest.onnx",
    r"app\ml\models\vuln_gradient_boosting.onnx",
]

for f in files:
    print("FILE:", f)
    session = ort.InferenceSession(f)
    print("Inputs:", [(i.name, list(i.shape) if i.shape else None, i.type) for i in session.get_inputs()])
    print("Outputs:", [(o.name, list(o.shape) if o.shape else None, o.type) for o in session.get_outputs()])
    print()
