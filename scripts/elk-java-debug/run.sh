#!/bin/bash
# elk-java-debug 构建 + 运行脚本.
# 用法:
#   ./run.sh <input.elk.json> <outDir>          # 构建(如需) + 跑 ELK Java 布局, 输出每模块前图快照
#   ELK_JAVA_HOME=/path/to/jdk ./run.sh ...     # 指定 JDK (默认 /opt/homebrew/opt/openjdk@21)
#
# 前置:
#   - JDK 21 (brew install openjdk@21)
#   - 依赖 jar (首次自动下载到 lib/): guava, emf.ecore, xtext.xbase.lib, elk 0.12.0 系列
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
JAVA_HOME="${ELK_JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
LIB="$DIR/lib"
OUT="$DIR/out"

JARS=(
  "https://repo1.maven.org/maven2/com/google/guava/guava/33.4.0-jre/guava-33.4.0-jre.jar"
  "https://repo1.maven.org/maven2/org/eclipse/emf/org.eclipse.emf.common/2.31.0/org.eclipse.emf.common-2.31.0.jar"
  "https://repo1.maven.org/maven2/org/eclipse/emf/org.eclipse.emf.ecore/2.36.0/org.eclipse.emf.ecore-2.36.0.jar"
  "https://repo1.maven.org/maven2/org/eclipse/emf/org.eclipse.emf.ecore.xmi/2.36.0/org.eclipse.emf.ecore.xmi-2.36.0.jar"
  "https://repo1.maven.org/maven2/org/eclipse/xtext/org.eclipse.xtext.xbase.lib/2.37.0/org.eclipse.xtext.xbase.lib-2.37.0.jar"
  "https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.graph/0.12.0/org.eclipse.elk.graph-0.12.0.jar"
  "https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.core/0.12.0/org.eclipse.elk.core-0.12.0.jar"
  "https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.alg.common/0.12.0/org.eclipse.elk.alg.common-0.12.0.jar"
  "https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.alg.layered/0.12.0/org.eclipse.elk.alg.layered-0.12.0.jar"
  "https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.graph.json/0.12.0/org.eclipse.elk.graph.json-0.12.0.jar"
  "https://repo1.maven.org/maven2/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar"
)

mkdir -p "$LIB" "$OUT"
for u in "${JARS[@]}"; do
  f="$LIB/$(basename "$u")"
  [ -f "$f" ] || curl -sSL -o "$f" "$u"
done

if [ ! -f "$OUT/DebugMain.class" ] || [ "$DIR/DebugMain.java" -nt "$OUT/DebugMain.class" ]; then
  "$JAVA_HOME/bin/javac" -d "$OUT" -cp "$LIB/*" -source 17 -target 17 "$DIR/DebugMain.java"
fi

if [ $# -lt 2 ]; then
  echo "用法: $0 <input.elk.json> <outDir>"
  echo "输入: node ../probe.mjs export <elkt> -o <out.elk.json>"
  exit 1
fi

if [ -n "${ELK_INSTR:-}" ]; then
  CP="$OUT:$ELK_INSTR"
  for j in "$LIB"/*.jar; do
    case "$j" in *elk-layered*) ;; *) CP="$CP:$j" ;; esac
  done
else
  CP="$OUT:$LIB/*"
fi
"$JAVA_HOME/bin/java" -cp "$CP" DebugMain "$1" "$2"
