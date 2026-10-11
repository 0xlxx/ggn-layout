import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.elk.alg.layered.ElkLayered;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LPort;
import org.eclipse.elk.alg.layered.graph.Layer;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.IElkProgressMonitor;
import org.eclipse.elk.core.util.LoggedGraph;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkGraphElement;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkPort;
import org.eclipse.elk.graph.ElkGraphFactory;
import org.eclipse.elk.graph.properties.Property;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.options.Direction;
import org.eclipse.elk.core.options.PortSide;
import org.eclipse.elk.core.options.PortConstraints;
import org.eclipse.elk.core.data.LayoutAlgorithmData;

/**
 * ELK Java 调试运行器: 读 .json (ELK 标准 JSON 格式) 图, 跑 layered 布局,
 * 收集每个模块执行前的图快照 (monitor.logGraph → JsonDebugUtil 输出).
 *
 * 用法: java -cp ... DebugMain <input.json> <outDir>
 * 输出: outDir/<slot>-Before-<Module>.json  和 <slot>-Finished.json
 */
public class DebugMain {

    // ── 极简 JSON 解析 (Object/Map/List/String/Double/Boolean/null) ──
    static Object parseJson(String s) {
        int[] i = { 0 };
        return parseValue(s, i);
    }

    static Object parseValue(String s, int[] i) {
        skipWs(s, i);
        char c = s.charAt(i[0]);
        if (c == '{') return parseObj(s, i);
        if (c == '[') return parseArr(s, i);
        if (c == '"') return parseStr(s, i);
        if (c == 't') { i[0] += 4; return Boolean.TRUE; }
        if (c == 'f') { i[0] += 5; return Boolean.FALSE; }
        if (c == 'n') { i[0] += 4; return null; }
        return parseNum(s, i);
    }

    static Map<String, Object> parseObj(String s, int[] i) {
        i[0]++; // {
        Map<String, Object> m = new HashMap<>();
        skipWs(s, i);
        if (s.charAt(i[0]) == '}') { i[0]++; return m; }
        while (true) {
            skipWs(s, i);
            String k = parseStr(s, i);
            skipWs(s, i);
            i[0]++; // :
            m.put(k, parseValue(s, i));
            skipWs(s, i);
            char c = s.charAt(i[0]++);
            if (c == '}') break;
        }
        return m;
    }

    static List<Object> parseArr(String s, int[] i) {
        i[0]++; // [
        List<Object> l = new ArrayList<>();
        skipWs(s, i);
        if (s.charAt(i[0]) == ']') { i[0]++; return l; }
        while (true) {
            l.add(parseValue(s, i));
            skipWs(s, i);
            char c = s.charAt(i[0]++);
            if (c == ']') break;
        }
        return l;
    }

    static String parseStr(String s, int[] i) {
        i[0]++; // "
        StringBuilder b = new StringBuilder();
        while (true) {
            char c = s.charAt(i[0]++);
            if (c == '\\') {
                char e = s.charAt(i[0]++);
                if (e == 'n') b.append('\n');
                else if (e == 't') b.append('\t');
                else b.append(e);
            } else if (c == '"') break;
            else b.append(c);
        }
        return b.toString();
    }

    static Double parseNum(String s, int[] i) {
        int start = i[0];
        while (i[0] < s.length() && "-+.eE0123456789".indexOf(s.charAt(i[0])) >= 0) i[0]++;
        return Double.parseDouble(s.substring(start, i[0]));
    }

    static void skipWs(String s, int[] i) {
        while (i[0] < s.length() && Character.isWhitespace(s.charAt(i[0]))) i[0]++;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> asMap(Object o) { return (Map<String, Object>) o; }
    @SuppressWarnings("unchecked")
    static List<Object> asList(Object o) { return (List<Object>) o; }

    // ── JSON → ElkGraph 构建 ──
    static ElkNode buildGraph(Map<String, Object> json) {
        ElkGraphFactory f = ElkGraphFactory.eINSTANCE;
        ElkNode root = f.createElkNode();
        root.setIdentifier((String) json.get("id"));
        applyOptions(root, json.get("layoutOptions"));

        // 先建所有节点 (含子节点), 处理 children
        List<ElkNode> nodes = new ArrayList<>();
        Object children = json.get("children");
        if (children != null) {
            for (Object c : asList(children)) {
                nodes.add(buildNode(f, asMap(c)));
            }
        }
        for (ElkNode n : nodes) root.getChildren().add(n);

        // 边: 引用 "N1" 或 "N1.p1" (端口 id 全局唯一). 边挂到两端节点最近公共祖先的 containedEdges.
        Object edges = json.get("edges");
        if (edges != null) {
            for (Object e : asList(edges)) {
                Map<String, Object> em = asMap(e);
                ElkEdge edge = f.createElkEdge();
                edge.setIdentifier((String) em.get("id"));
                applyOptions(edge, em.get("properties"));
                ElkGraphElement srcEl = null;
                ElkGraphElement tgtEl = null;
                Object srcs = em.get("sources");
                Object tgts = em.get("targets");
                if (srcs != null && !asList(srcs).isEmpty()) {
                    srcEl = resolveRef(root, (String) asList(srcs).get(0));
                }
                if (tgts != null && !asList(tgts).isEmpty()) {
                    tgtEl = resolveRef(root, (String) asList(tgts).get(0));
                }
                if (srcEl instanceof ElkPort) {
                    edge.getSources().add((ElkPort) srcEl);
                } else if (srcEl instanceof ElkNode) {
                    edge.getSources().add((ElkNode) srcEl);
                }
                if (tgtEl instanceof ElkPort) {
                    edge.getTargets().add((ElkPort) tgtEl);
                } else if (tgtEl instanceof ElkNode) {
                    edge.getTargets().add((ElkNode) tgtEl);
                }
                ElkNode owner = lowestCommonAncestor(
                    srcEl instanceof ElkNode ? (ElkNode) srcEl
                        : srcEl instanceof ElkPort ? ((ElkPort) srcEl).getParent() : null,
                    tgtEl instanceof ElkNode ? (ElkNode) tgtEl
                        : tgtEl instanceof ElkPort ? ((ElkPort) tgtEl).getParent() : null);
                Object edgeLabels = em.get("labels");
                if (edgeLabels != null) {
                    for (Object el : asList(edgeLabels)) {
                        Map<String, Object> lm = asMap(el);
                        org.eclipse.elk.graph.ElkLabel label = org.eclipse.elk.graph.util.ElkGraphUtil.createLabel((String) lm.get("text"), edge);
                        if (lm.get("width") != null) label.setWidth((Double) lm.get("width"));
                        if (lm.get("height") != null) label.setHeight((Double) lm.get("height"));
                        if (lm.get("properties") != null) applyOptions(label, lm.get("properties"));
                    }
                }
                owner.getContainedEdges().add(edge);
            }
        }
        return root;
    }

    static List<ElkNode> pathToRoot(ElkNode n) {
        List<ElkNode> path = new ArrayList<>();
        while (n != null) {
            path.add(0, n);
            n = n.getParent();
        }
        return path;
    }

    static ElkNode lowestCommonAncestor(ElkNode a, ElkNode b) {
        if (a == null) return b;
        if (b == null) return a;
        List<ElkNode> pa = pathToRoot(a);
        List<ElkNode> pb = pathToRoot(b);
        ElkNode lca = pa.get(0);
        for (int i = 0; i < Math.min(pa.size(), pb.size()); i++) {
            if (pa.get(i) == pb.get(i)) lca = pa.get(i);
            else break;
        }
        return lca;
    }

    static ElkNode buildNode(ElkGraphFactory f, Map<String, Object> m) {
        ElkNode n = f.createElkNode();
        n.setIdentifier((String) m.get("id"));
        Object w = m.get("width");
        Object h = m.get("height");
        if (w != null) n.setWidth((Double) w);
        if (h != null) n.setHeight((Double) h);
        applyOptions(n, m.get("properties"));
        Object ports = m.get("ports");
        if (ports != null) {
            for (Object p : asList(ports)) {
                Map<String, Object> pm = asMap(p);
                ElkPort port = f.createElkPort();
                port.setIdentifier((String) pm.get("id"));
                if (pm.get("width") != null) port.setWidth((Double) pm.get("width"));
                if (pm.get("height") != null) port.setHeight((Double) pm.get("height"));
                if (pm.get("x") != null) port.setX((Double) pm.get("x"));
                if (pm.get("y") != null) port.setY((Double) pm.get("y"));
                applyOptions(port, pm.get("properties"));
                Object portLabels = pm.get("labels");
                if (portLabels != null) {
                    for (Object pl : asList(portLabels)) {
                        Map<String, Object> plm = asMap(pl);
                        org.eclipse.elk.graph.ElkLabel label = f.createElkLabel();
                        label.setText((String) plm.get("text"));
                        if (plm.get("width") != null) label.setWidth((Double) plm.get("width"));
                        if (plm.get("height") != null) label.setHeight((Double) plm.get("height"));
                        if (plm.get("x") != null) label.setX((Double) plm.get("x"));
                        if (plm.get("y") != null) label.setY((Double) plm.get("y"));
                        port.getLabels().add(label);
                    }
                }
                n.getPorts().add(port);
            }
        }
        Object labels = m.get("labels");
        if (labels != null) {
            for (Object l : asList(labels)) {
                Map<String, Object> lm = asMap(l);
                org.eclipse.elk.graph.ElkLabel label = f.createElkLabel();
                label.setText((String) lm.get("text"));
                if (lm.get("width") != null) label.setWidth((Double) lm.get("width"));
                if (lm.get("height") != null) label.setHeight((Double) lm.get("height"));
                n.getLabels().add(label);
            }
        }
        Object children = m.get("children");
        if (children != null) {
            for (Object c : asList(children)) {
                n.getChildren().add(buildNode(f, asMap(c)));
            }
        }
        return n;
    }

    static void applyOptions(ElkGraphElement el, Object props) {
        if (props == null) return;
        for (Map.Entry<String, Object> e : asMap(props).entrySet()) {
            String key = e.getKey();
            Object val = e.getValue();
            try {
                if ("elk.direction".equals(key) || "org.eclipse.elk.direction".equals(key)) {
                    el.setProperty(CoreOptions.DIRECTION, Direction.valueOf((String) val));
                } else if ("org.eclipse.elk.randomSeed".equals(key)) {
                    el.setProperty(CoreOptions.RANDOM_SEED, Integer.parseInt(val.toString()));
                } else if ("elk.hierarchyHandling".equals(key) || "org.eclipse.elk.hierarchyHandling".equals(key)) {
                    el.setProperty(org.eclipse.elk.core.options.CoreOptions.HIERARCHY_HANDLING,
                            org.eclipse.elk.core.options.HierarchyHandling.valueOf((String) val));
                } else if ("org.eclipse.elk.separateConnectedComponents".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.SEPARATE_CONNECTED_COMPONENTS,
                            Boolean.parseBoolean(val.toString()));
                } else if ("org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.NODE_PLACEMENT_BK_FIXED_ALIGNMENT,
                            org.eclipse.elk.alg.layered.options.FixedAlignment.valueOf((String) val));
                } else if ("org.eclipse.elk.layered.crossingMinimization.strategy".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.CROSSING_MINIMIZATION_STRATEGY,
                            org.eclipse.elk.alg.layered.options.CrossingMinimizationStrategy.valueOf((String) val));
                } else if ("org.eclipse.elk.port.side".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.PORT_SIDE,
                            PortSide.valueOf((String) val));
                } else if ("org.eclipse.elk.port.index".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.PORT_INDEX,
                            Integer.parseInt(val.toString()));
                } else if ("org.eclipse.elk.port.x".equals(key)) {
                    ((ElkPort) el).setX(Double.parseDouble(val.toString()));
                } else if ("org.eclipse.elk.port.y".equals(key)) {
                    ((ElkPort) el).setY(Double.parseDouble(val.toString()));
                } else if ("org.eclipse.elk.portConstraints".equals(key) || "elk.portConstraints".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.PORT_CONSTRAINTS,
                            PortConstraints.valueOf((String) val));
                } else if ("org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.NODE_PLACEMENT_BK_FIXED_ALIGNMENT,
                            org.eclipse.elk.alg.layered.options.FixedAlignment.valueOf((String) val));
                } else if ("org.eclipse.elk.port.borderOffset".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.PORT_BORDER_OFFSET,
                            Double.parseDouble(val.toString()));
                } else if ("org.eclipse.elk.nodeLabels.padding".equals(key)) {
                    String[] parts = val.toString().split(",");
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.NODE_LABELS_PADDING,
                            new org.eclipse.elk.core.math.ElkPadding(Double.parseDouble(parts[0].trim()),
                                    Double.parseDouble(parts[1].trim()), Double.parseDouble(parts[2].trim()),
                                    Double.parseDouble(parts[3].trim())));
                } else if ("org.eclipse.elk.nodeSize.constraints".equals(key)) {
                    java.util.EnumSet<org.eclipse.elk.core.options.SizeConstraint> sc = java.util.EnumSet.noneOf(org.eclipse.elk.core.options.SizeConstraint.class);
                    for (String p2 : val.toString().split(" ")) {
                        sc.add(org.eclipse.elk.core.options.SizeConstraint.valueOf(p2.trim()));
                    }
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.NODE_SIZE_CONSTRAINTS, sc);
                } else if ("org.eclipse.elk.nodeLabels.placement".equals(key)) {
                    java.util.EnumSet<org.eclipse.elk.core.options.NodeLabelPlacement> sc = java.util.EnumSet.noneOf(org.eclipse.elk.core.options.NodeLabelPlacement.class);
                    for (String p2 : val.toString().split(" ")) {
                        sc.add(org.eclipse.elk.core.options.NodeLabelPlacement.valueOf(p2.trim()));
                    }
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.NODE_LABELS_PLACEMENT, sc);
                } else if ("org.eclipse.elk.layered.layering.strategy".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.LAYERING_STRATEGY,
                            org.eclipse.elk.alg.layered.options.LayeringStrategy.valueOf((String) val));
                } else if ("org.eclipse.elk.layered.layering.nodePromotion.strategy".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.LAYERING_NODE_PROMOTION_STRATEGY,
                            org.eclipse.elk.alg.layered.options.NodePromotionStrategy.valueOf((String) val));
                } else if ("org.eclipse.elk.layered.cycleBreaking.strategy".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.CYCLE_BREAKING_STRATEGY,
                            org.eclipse.elk.alg.layered.options.CycleBreakingStrategy.valueOf((String) val));
                } else if ("org.eclipse.elk.layered.considerModelOrder.strategy".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.CONSIDER_MODEL_ORDER_STRATEGY,
                            org.eclipse.elk.alg.layered.options.OrderingStrategy.valueOf((String) val));
                } else if ("org.eclipse.elk.layered.crossingMinimization.greedySwitch.type".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE,
                            org.eclipse.elk.alg.layered.options.GreedySwitchType.valueOf((String) val));
                } else if ("org.eclipse.elk.layered.feedbackEdges".equals(key)) {
                    el.setProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.FEEDBACK_EDGES,
                            Boolean.parseBoolean(val.toString()));
                } else if ("org.eclipse.elk.padding".equals(key)) {
                    if (val instanceof Double) {
                        el.setProperty(org.eclipse.elk.core.options.CoreOptions.PADDING,
                                new org.eclipse.elk.core.math.ElkPadding((Double) val));
                    } else {
                        String[] parts = val.toString().split(",");
                        if (parts.length == 4) {
                            el.setProperty(org.eclipse.elk.core.options.CoreOptions.PADDING,
                                    new org.eclipse.elk.core.math.ElkPadding(Double.parseDouble(parts[0].trim()),
                                            Double.parseDouble(parts[1].trim()), Double.parseDouble(parts[2].trim()),
                                            Double.parseDouble(parts[3].trim())));
                        } else {
                            el.setProperty(org.eclipse.elk.core.options.CoreOptions.PADDING,
                                    new org.eclipse.elk.core.math.ElkPadding(Double.parseDouble(val.toString())));
                        }
                    }
                } else {
                    // M0-B/M1: 通用注册 option 应用 (LayoutMetaDataService 已 register).
                    // getOptionData 命中核心/分层全部已注册 option (spacing.*/edgeRouting/策略/枚举...),
                    // parseValue 按 option 类型解析字符串; 未注册/无法解析才落到原始 Property.
                    org.eclipse.elk.core.data.LayoutOptionData data =
                            LayoutMetaDataService.getInstance().getOptionData(key);
                    if (data != null && data.canParseValue()) {
                        el.setProperty(data, data.parseValue(val.toString()));
                    } else {
                        el.setProperty(new Property<Object>(key), val);
                    }
                }
            } catch (Exception ex) {
                // 忽略无法转换的属性
            }
        }
    }

    static ElkGraphElement resolveRef(ElkNode root, String ref) {
        int dot = ref.indexOf('.');
        if (dot >= 0) {
            // "N1.P2" 形式: 节点.端口; 若后段是子节点 (嵌套图), 返回子节点 (INCLUDE_CHILDREN 跨层边).
            ElkNode n = findNode(root, ref.substring(0, dot));
            if (n == null) return null;
            String rest = ref.substring(dot + 1);
            for (ElkPort p : n.getPorts()) {
                if (rest.equals(p.getIdentifier())) return p;
            }
            ElkNode child = findNode(n, rest);
            if (child != null) return child;
            return n;
        }
        // 无点: 先按全局端口 id 查找 (ElkGraphJson 用全局唯一端口 id)
        ElkPort port = findPort(root, ref);
        if (port != null) return port;
        return findNode(root, ref);
    }

    static ElkPort findPort(ElkNode n, String id) {
        for (ElkPort p : n.getPorts()) {
            if (id.equals(p.getIdentifier())) return p;
        }
        for (ElkNode c : n.getChildren()) {
            ElkPort r = findPort(c, id);
            if (r != null) return r;
        }
        return null;
    }

    static ElkNode findNode(ElkNode root, String id) {
        if (id.equals(root.getIdentifier())) return root;
        for (ElkNode child : root.getChildren()) {
            ElkNode r = findNode(child, id);
            if (r != null) return r;
        }
        return null;
    }

    // ── monitor: 收集每阶段图快照 (完整实现 IElkProgressMonitor, subTask 返回自身) ──
    static class CollectingMonitor implements IElkProgressMonitor {
        final String outDir;
        final List<String> tags = new ArrayList<>();
        boolean running = true;
        int seq = 0;

        CollectingMonitor(String outDir) {
            this.outDir = outDir;
        }

        @Override public boolean begin(String taskName, float totalWork) { return true; }
        @Override public void worked(float work) {}
        @Override public void done() { running = false; }
        @Override public boolean isRunning() { return running; }
        @Override public String getTaskName() { return "debug"; }
        @Override public IElkProgressMonitor subTask(float work) { return this; }
        @Override public java.util.List<IElkProgressMonitor> getSubMonitors() { return java.util.Collections.emptyList(); }
        @Override public IElkProgressMonitor getParentMonitor() { return null; }
        @Override public boolean isLoggingEnabled() { return true; }
        @Override public boolean isLogPersistenceEnabled() { return false; }
        @Override public void log(Object message) { System.err.println("LOG " + message); }
        @Override public java.util.List<String> getLogs() { return java.util.Collections.emptyList(); }
        @Override public void logGraph(ElkNode graph, String tag) {
            tags.add(tag);
            save(tag, graph);
        }
        @Override public void logGraph(Object graph, String tag, LoggedGraph.Type graphType) {
            tags.add(tag);
            save(tag, graph);
            if (graph instanceof LGraph) {
                LGraph lg = (LGraph) graph;
                System.out.println("GP " + tag + ": props=" + lg.getProperty(
                    org.eclipse.elk.alg.layered.options.InternalProperties.GRAPH_PROPERTIES)
                    + " parent=" + (lg.getParentNode() == null ? "ROOT" : lg.getParentNode().getDesignation())
                    + " maxMO=" + lg.getProperty(org.eclipse.elk.alg.layered.options.InternalProperties.MAX_MODEL_ORDER_NODES)
                    + " cbNum=" + lg.getProperty(org.eclipse.elk.alg.layered.options.InternalProperties.CB_NUM_MODEL_ORDER_GROUPS)
                    + " cb=" + lg.getProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.CYCLE_BREAKING_STRATEGY));
            }
        }
        @Override public java.util.List<LoggedGraph> getLoggedGraphs() { return java.util.Collections.emptyList(); }
        @Override public java.nio.file.Path getDebugFolder() { return null; }
        @Override public boolean isExecutionTimeMeasured() { return false; }
        @Override public double getExecutionTime() { return 0; }
        @Override public boolean isCanceled() { return false; }

        void save(String tag, Object graph) {
            try {
                FileWriter w = new FileWriter(new File(outDir, sanitize(tag) + "_" + (seq++) + ".json"), StandardCharsets.UTF_8);
                w.write(graph.toString());
                System.err.println("SAVE " + tag + " cls=" + graph.getClass().getName() + " isLGraph=" + (graph instanceof LGraph) + " isElkNode=" + (graph instanceof ElkNode));
                if (graph instanceof LGraph) {
                    w.write("// PORTS\n");
                    writePorts(w, (LGraph) graph);
                } else if (graph instanceof ElkNode) {
                    w.write("// PORTS\n");
                    writePorts(w, (ElkNode) graph);
                }
                w.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }

        void writePorts(FileWriter w, LGraph g) throws IOException {
            for (LNode n : g.getLayerlessNodes()) {
                for (LPort p : n.getPorts()) {
                    w.write("PORT " + n.getDesignation() + "." + p.id + ": x=" + p.getPosition().x + " y=" + p.getPosition().y + "\n");
                }
            }
            for (Layer l : g.getLayers()) {
                for (LNode n : l.getNodes()) {
                    for (LPort p : n.getPorts()) {
                        w.write("PORT " + n.getDesignation() + "." + p.id + ": x=" + p.getPosition().x + " y=" + p.getPosition().y + "\n");
                    }
                }
            }
        }

        void writePorts(FileWriter w, ElkNode n) throws IOException {
            for (ElkPort p : n.getPorts()) {
                w.write("PORT " + n.getIdentifier() + "." + p.getIdentifier() + ": x=" + p.getX() + " y=" + p.getY() + "\n");
            }
            for (ElkNode c : n.getChildren()) {
                writePorts(w, c);
            }
        }

        static String sanitize(String tag) {
            return tag.replaceAll("[^A-Za-z0-9._-]", "_");
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("用法: DebugMain <input.json> <outDir>");
            System.exit(1);
        }
        String input = args[0];
        String outDir = args[1];
        new File(outDir).mkdirs();

        // ELK 元数据注册 (META-INF/services 自动发现已注册, 这里手动补注册)
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();

        String json = new String(Files.readAllBytes(new File(input).toPath()), StandardCharsets.UTF_8);
        // M1: 改用官方 ELK JSON importer (与 elkjs 完全同一条导入路径), 替代手写 buildGraph.
        // 修复手写导入的系列问题: 端口排序/复合跨层边/自环/选项属性丢失 (③工具待修类).
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        if (System.getenv().containsKey("DEBUG_PROPS")) {
            System.out.println("ROOT PROPS: " + root.getAllProperties());
            System.out.println("edgeRouting=" + root.getProperty(org.eclipse.elk.core.options.CoreOptions.EDGE_ROUTING)
                + " layeredEdgeRouting=" + root.getProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.EDGE_ROUTING)
                + " crossmin=" + root.getProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.CROSSING_MINIMIZATION_STRATEGY)
                + " hasER=" + root.hasProperty(org.eclipse.elk.core.options.CoreOptions.EDGE_ROUTING)
                + " hasCM=" + root.hasProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.CROSSING_MINIMIZATION_STRATEGY));
        }

        // 跑布局 (递归, 处理 compound)
        CollectingMonitor monitor = new CollectingMonitor(outDir);
        monitor.begin("root", 1);
        root.setProperty(org.eclipse.elk.core.options.CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        new RecursiveGraphLayoutEngine().layout(root, monitor);
        monitor.done();

        System.out.println("已输出 " + monitor.tags.size() + " 个图快照:");
        for (String t : monitor.tags) System.out.println("  " + t);
        System.out.println("最终坐标: ");
        dumpCoords(root, "");
        System.out.println("端口侧: ");
        dumpPortSides(root, "");
        System.out.println("标签: ");
        dumpLabels(root, "");
    }

    static void dumpPortSides(ElkNode n, String indent) {
        for (org.eclipse.elk.graph.ElkPort p : n.getPorts()) {
            System.out.println(indent + n.getIdentifier() + "." + p.getIdentifier() + " side="
                + p.getProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.PORT_SIDE)
                + " x=" + p.getX() + " y=" + p.getY());
        }
        for (ElkNode c : n.getChildren()) dumpPortSides(c, indent + "  ");
    }

    static void dumpLabels(ElkNode n, String indent) {
        for (org.eclipse.elk.graph.ElkLabel l : n.getLabels()) {
            System.out.println(indent + n.getIdentifier() + ".label x=" + l.getX() + " y=" + l.getY() + " w=" + l.getWidth() + " h=" + l.getHeight());
        }
        for (ElkNode c : n.getChildren()) dumpLabels(c, indent + "  ");
    }
    static void dumpCoords(ElkNode n, String indent) {
        System.out.println(indent + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY()
            + " w=" + n.getWidth() + " h=" + n.getHeight());
        for (ElkNode c : n.getChildren()) dumpCoords(c, indent + "  ");
    }
}
