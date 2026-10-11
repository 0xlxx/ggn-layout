/**
 * ElkgJsonMain — 加载 .elkg (XMI/EMF) 并导出规范 ELK JSON (输入图, 不布局).
 *
 * 用途: 验证 elkg ↔ elkt 转换等价性.
 *   elkg 侧: ELK Java 加载 elkg → ElkGraphJson.forGraph(root).toJson() (规范 JSON);
 *   elkt 侧: ggn parseElkt + elktToElkJson (规范 JSON);
 *   两端 diff = 转换是否正确.
 *
 * 注意: ElkGraphJson 导出只包含根节点直接 containedEdges, 层级内子节点下的边会丢失
 * (盲通信 66 条只导出 13 条) → 本工具手动递归收集全部 containedEdges 覆盖导出结果.
 *
 * 用法: java -cp "out:lib/*" ElkgJsonMain <input.elkg>
 * 输出: stdout 一行规范 JSON.
 */
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.util.persistence.ElkGraphResourceFactory;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkConnectableShape;
import org.eclipse.elk.graph.ElkGraphPackage;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class ElkgJsonMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        ElkGraphPackage.eINSTANCE.getName();
        if (args.length == 0) {
            System.err.println("用法: ElkgJsonMain <file.elkg> [<file2.elkg> ...]  (一次 JVM 处理多个, 避免 550 次启动)");
            System.exit(1);
        }
        // 每个 elkg 独立 ResourceSet (避免 EMF 缓存/状态污染), 同一 JVM 循环处理.
        for (int i = 0; i < args.length; i++) {
            String path = args[i];
            ResourceSet rs = new ResourceSetImpl();
            rs.getResourceFactoryRegistry().getExtensionToFactoryMap().put("elkg", new ElkGraphResourceFactory());
            URI uri = URI.createFileURI(new File(path).getAbsolutePath());
            Resource res = rs.createResource(uri);
            res.load(null);
            ElkNode root = (ElkNode) res.getContents().get(0);
            String json = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(root)
                .omitLayout(false)
                .omitZeroPositions(true)
                .omitZeroDimension(true)
                .toJson();

            // 手动递归收集全部 containedEdges (ElkGraphJson 导出会丢子节点下的边)
            JsonObject obj = JsonParser.parseString(json).getAsJsonObject();
            JsonArray edges = new JsonArray();
            List<ElkNode> stack = new ArrayList<>();
            stack.add(root);
            int eid = 1;
            while (!stack.isEmpty()) {
                ElkNode n = stack.remove(stack.size() - 1);
                for (ElkEdge e : n.getContainedEdges()) {
                    JsonObject jo = new JsonObject();
                    jo.addProperty("id", e.getIdentifier() != null ? e.getIdentifier() : "E" + (eid++));
                    jo.add("sources", refs(e.getSources()));
                    jo.add("targets", refs(e.getTargets()));
                    edges.add(jo);
                }
                stack.addAll(n.getChildren());
            }
            obj.add("edges", edges);
            System.out.println("### " + i + ":" + new File(path).getName());
            System.out.println(obj.toString());
        }
    }

    static JsonArray refs(List<? extends ElkConnectableShape> shapes) {
        JsonArray arr = new JsonArray();
        for (ElkConnectableShape s : shapes) arr.add(s.getIdentifier());
        return arr;
    }
}
