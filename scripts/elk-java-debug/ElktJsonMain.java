/**
 * P1-A: 用 ELK Java 的 Xtext elkt 解析器 (org.eclipse.elk.graph.text) 独立解析 .elkt → ElkGraphJson.
 *
 * 打破循环论证: oracle 差分当前让 Java 吃 elktToElkJson(ggn parseElkt) 的输出, 与 ggn 同源派生,
 * 只能证算法等价、不能证输入正确. 本工具让 Java 侧
 * 用 ELK 官方 Xtext 文法直接解析 .elkt, 再导出标准 ElkGraphJson, 与 ggn elktToElkJson 输出 diff
 * → 解析 + 转换正确性同时被覆盖, 且天然覆盖全部 .elkt (不限于 realworld 的 elkg).
 *
 * 依赖 (scripts/elk-java-debug/xtext-lib/): org.eclipse.elk.graph.text-0.12.0 + xtext 2.37 运行时.
 * 编译: javac -cp "out:xtext-lib/*:lib/*" -source 17 -target 17 -d out ElktJsonMain.java
 * 用法: java -cp "out:xtext-lib/*:lib/*" ElktJsonMain <a.elkt> [b.elkt ...]
 * 输出: 每个文件一行标准 ELK JSON (ElkGraphJson 导出, 与 ElkgJsonMain 同款导出器).
 */
import java.util.ArrayList;
import java.util.List;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkPort;
import org.eclipse.elk.graph.ElkConnectableShape;
import org.eclipse.elk.graph.text.ElkGraphStandaloneSetup;
import org.eclipse.elk.graph.json.ElkGraphJson;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.resource.XtextResourceSet;
import com.google.inject.Injector;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class ElktJsonMain {
  public static void main(String[] args) throws Exception {
    Injector injector = new ElkGraphStandaloneSetup().createInjectorAndDoEMFRegistration();
    XtextResourceSet resourceSet = injector.getInstance(XtextResourceSet.class);
    int failures = 0;
    for (int i = 0; i < args.length; i++) {
      String path = args[i];
      try {
        Resource resource = resourceSet.getResource(URI.createFileURI(path), true);
        ElkNode root = (ElkNode) resource.getContents().get(0);
        String json = ElkGraphJson.forGraph(root)
            .omitZeroPositions(true)
            .omitZeroDimension(true)
            .omitLayout(false)
            .shortLayoutOptionKeys(false)
            .toJson();
        // 手动递归收集全部 containedEdges (ElkGraphJson 导出只含根节点直接边, 嵌套边丢失 — 同 ElkgJsonMain)
        JsonObject obj = JsonParser.parseString(json).getAsJsonObject();
        JsonArray edges = new JsonArray();
        java.util.Map<Object, String> shapePaths = new java.util.HashMap<>();
        collectEdges(root, "", true, edges, shapePaths); // 含 root 自身 containedEdges; 端点解析为全限定路径
        obj.add("edges", edges);
        System.out.println("### " + i + " " + path);
        System.out.println(obj.toString());
      } catch (Throwable t) {
        failures++;
        System.err.println("### " + i + " " + path + " ERROR " + t);
      }
    }
    System.err.println("### total " + args.length + " failures " + failures);
  }

  static void collectEdges(ElkNode n, String path, boolean isRoot, JsonArray edges, java.util.Map<Object, String> shapePaths) {
    // 路径不含根 id (n0): root 的边 owner = ""; 子节点用自身 id 起路径
    String full = path.isEmpty() ? (isRoot ? "" : n.getIdentifier()) : path + "." + n.getIdentifier();
    if (!isRoot) shapePaths.put(n, full);
    // 端口: 条件剥图元后缀 (同名兄弟消歧), 全限定 = nodePath.端口显示名
    List<String> portIds = new ArrayList<>();
    for (ElkPort p : n.getPorts()) portIds.add(p.getIdentifier());
    for (ElkPort p : n.getPorts()) {
      String pid = p.getIdentifier();
      String base = pid.replaceAll("_g\\d+$", "");
      boolean collide = false;
      for (String x : portIds) if (!x.equals(pid) && x.replaceAll("_g\\d+$", "").equals(base)) { collide = true; break; }
      String name = collide ? pid : base;
      shapePaths.put(p, full.isEmpty() ? name : full + "." + name);
    }
    for (ElkEdge e : n.getContainedEdges()) {
      JsonObject jo = new JsonObject();
      jo.addProperty("id", e.getIdentifier() != null ? e.getIdentifier() : "E");
      jo.add("sources", refs(e.getSources(), shapePaths));
      jo.add("targets", refs(e.getTargets(), shapePaths));
      jo.addProperty("graph", full);
      edges.add(jo);
    }
    for (ElkNode c : n.getChildren()) collectEdges(c, full, false, edges, shapePaths);
  }

  static JsonArray refs(List<? extends ElkConnectableShape> shapes, java.util.Map<Object, String> shapePaths) {
    JsonArray arr = new JsonArray();
    for (ElkConnectableShape s : shapes) {
      String full = shapePaths.get(s);
      arr.add(full != null ? full : s.getIdentifier());
    }
    return arr;
  }
}
